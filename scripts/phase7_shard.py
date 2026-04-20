"""Phase 7 sharded runner — scrapes YouTube watch-pages and writes to D1.

Designed to run in GitHub Actions matrix. Each shard:
  1. Queries D1 for trailers not yet in trailer_metadata
  2. Filters to this shard using hash(youtube_id) % total == shard_id
  3. Scrapes watch pages (async aiohttp, anti-abuse hardened)
  4. Batches inserts back to D1

Usage:
    python scripts/phase7_shard.py --shard 0 --total 10

Environment variables:
    CF_API_TOKEN, CF_ACCOUNT_ID, D1_DATABASE_ID
"""

import argparse
import asyncio
import hashlib
import json
import logging
import os
import random
import re
import sys
import time
from collections import deque

import aiohttp
import requests

logger = logging.getLogger(__name__)

# D1 config
CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

# Scrape config
WATCH_URL = "https://www.youtube.com/watch?v={video_id}&bpctr=9999999999&has_verified=1"
WARMUP_URL = "https://www.youtube.com/"
CONCURRENCY = 8
JITTER_MIN = 0.05
JITTER_MAX = 0.25
MAX_RETRIES = 4
BACKOFF_BASE = 2.5
REQUEST_TIMEOUT = 25

# D1 batch flush
FLUSH_EVERY = 40  # videos per flush
D1_STMTS_PER_BATCH = 25  # statements per D1 API call (stay under 100KB)

# Circuit breaker
CB_WINDOW = 120
CB_ERR_RATE = 0.35
CB_PAUSE_SECONDS = 180

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
]

BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

PLAYER_RE = re.compile(r"ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|</script>)")


# ---------------------------------------------------------------------------
# D1 helpers (sync)
# ---------------------------------------------------------------------------

def d1_query(sql: str) -> list[dict]:
    resp = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw",
        headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
        json={"sql": sql}, timeout=120,
    )
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 query error: {data.get('errors')} — SQL: {sql[:200]}")
    results = data.get("result", [])
    if results and "results" in results[0]:
        inner = results[0]["results"]
        columns = inner.get("columns", [])
        rows = inner.get("rows", [])
        return [dict(zip(columns, row)) for row in rows]
    return []


def d1_batch(statements: list[str]) -> None:
    if not statements:
        return
    resp = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw",
        headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
        json=[{"sql": s} for s in statements], timeout=120,
    )
    data = resp.json()
    if not data.get("success"):
        # Try one retry
        time.sleep(2)
        resp = requests.post(
            f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw",
            headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
            json=[{"sql": s} for s in statements], timeout=120,
        )
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"D1 batch error: {data.get('errors')}")


def sql_escape(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("'", "''")
    return f"'{s}'"


# ---------------------------------------------------------------------------
# Scrape + parse
# ---------------------------------------------------------------------------

def _headers() -> dict:
    h = dict(BASE_HEADERS)
    h["User-Agent"] = random.choice(USER_AGENTS)
    return h


async def _warm_session(session: aiohttp.ClientSession):
    try:
        async with session.get(WARMUP_URL, headers=_headers(), timeout=aiohttp.ClientTimeout(total=15)):
            pass
    except Exception:
        pass


async def _fetch_player(session: aiohttp.ClientSession, youtube_id: str) -> tuple[dict | None, str]:
    url = WATCH_URL.format(video_id=youtube_id)
    last_reason = "unknown"
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with session.get(
                url, headers=_headers(), timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                sc = resp.status
                if sc == 429 or sc >= 500:
                    last_reason = f"http_{sc}"
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0.5, 2.0))
                        continue
                    return None, last_reason
                if sc != 200:
                    return None, f"http_{sc}"
                html = await resp.text()
        except asyncio.TimeoutError:
            last_reason = "timeout"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(BACKOFF_BASE * (2 ** attempt))
                continue
            return None, last_reason
        except Exception as e:
            last_reason = f"net:{type(e).__name__}"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(BACKOFF_BASE * (2 ** attempt))
                continue
            return None, last_reason

        m = PLAYER_RE.search(html)
        if not m:
            last_reason = "no_player_json"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0.5, 2.0))
                continue
            return None, last_reason
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            return None, "bad_json"
        ps = (data.get("playabilityStatus") or {}).get("status") or "UNKNOWN"
        if ps in ("OK", "LIVE_STREAM_OFFLINE"):
            return data, "ok"
        if ps in ("LOGIN_REQUIRED", "AGE_VERIFICATION_REQUIRED"):
            return None, f"playability:{ps}"
        last_reason = f"playability:{ps}"
        if attempt < MAX_RETRIES:
            await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(1.0, 3.0))
            continue
        return None, last_reason
    return None, last_reason


def _parse_subtitles(data):
    pct = (data.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
    tracks = pct.get("captionTracks") or []
    results = []
    seen = set()
    for t in tracks:
        lang = t.get("languageCode")
        if not lang:
            continue
        is_auto = 1 if t.get("kind") == "asr" else 0
        if (lang, is_auto) in seen:
            continue
        seen.add((lang, is_auto))
        results.append({"language": lang, "is_auto_generated": is_auto, "formats": "vtt,srt,ttml"})
    return results


def _parse_audio_tracks(data):
    formats = (data.get("streamingData") or {}).get("adaptiveFormats") or []
    seen = {}
    for fmt in formats:
        track = fmt.get("audioTrack")
        if not track:
            continue
        tid = track.get("id") or ""
        lang = tid.split(".")[0] if tid else ""
        if not lang or lang in seen:
            continue
        display_name = track.get("displayName", "")
        is_default = track.get("audioIsDefault", False)
        dn = display_name.lower()
        is_auto_dubbed = 1 if ("auto" in dn or "dubbed" in dn) else 0
        is_original = 1 if (is_default or "original" in dn) else 0
        seen[lang] = {
            "language": lang, "is_original": is_original,
            "is_auto_dubbed": is_auto_dubbed, "display_name": display_name or None,
        }
    return list(seen.values())


def _parse_formats(data):
    sd = data.get("streamingData") or {}
    all_fmts = (sd.get("formats") or []) + (sd.get("adaptiveFormats") or [])
    results = []
    seen_ids = set()
    for f in all_fmts:
        itag = f.get("itag")
        if itag is None or itag in seen_ids:
            continue
        seen_ids.add(itag)
        mime = f.get("mimeType") or ""
        codec = mime.split("codecs=", 1)[1].strip('"') if "codecs=" in mime else ""
        is_video = mime.startswith("video/")
        is_audio = mime.startswith("audio/")
        filesize = f.get("contentLength")
        try:
            filesize = int(filesize) if filesize else None
        except (ValueError, TypeError):
            filesize = None
        results.append({
            "format_id": str(itag),
            "height": f.get("height"), "width": f.get("width"),
            "vcodec": codec if is_video else None,
            "acodec": codec if is_audio else None,
            "fps": f.get("fps"), "filesize": filesize,
        })
    return results


def _parse_microformat(data):
    mf = ((data.get("microformat") or {}).get("playerMicroformatRenderer")) or {}
    vd = data.get("videoDetails") or {}
    try:
        length = int(vd.get("lengthSeconds") or 0) or None
    except (ValueError, TypeError):
        length = None
    try:
        views = int(vd.get("viewCount") or 0) or None
    except (ValueError, TypeError):
        views = None
    available = mf.get("availableCountries") or []
    return {
        "category": mf.get("category"),
        "upload_date": mf.get("uploadDate"),
        "publish_date": mf.get("publishDate"),
        "is_family_safe": 1 if mf.get("isFamilySafe") else 0,
        "is_unlisted": 1 if mf.get("isUnlisted") else 0,
        "is_private": 1 if vd.get("isPrivate") else 0,
        "available_countries": available,
        "available_country_count": len(available) or None,
        "length_seconds": length,
        "view_count_snapshot": views,
    }


def _parse_chapters(data):
    overlays = data.get("playerOverlays") or {}
    por = overlays.get("playerOverlayRenderer") or {}
    dpbr = (por.get("decoratedPlayerBarRenderer") or {}).get("decoratedPlayerBarRenderer") or {}
    mmpbr = (dpbr.get("playerBar") or {}).get("multiMarkersPlayerBarRenderer") or {}
    chapters = []
    for m in mmpbr.get("markersMap") or []:
        key = m.get("key", "")
        if "chapter" not in key.lower() and "DESCRIPTION_CHAPTERS" not in key:
            continue
        for c in (m.get("value") or {}).get("chapters") or []:
            cr = (c or {}).get("chapterRenderer") or {}
            title = (cr.get("title") or {}).get("simpleText")
            start_ms = cr.get("timeRangeStartMillis")
            if title is not None and start_ms is not None:
                chapters.append({"title": title, "start_ms": start_ms})
    return chapters


# ---------------------------------------------------------------------------
# Statement builders — produce D1 INSERT SQL from parsed data
# ---------------------------------------------------------------------------

def build_statements(movie_id: int, youtube_id: str, data: dict | None, fetch_status: str) -> list[str]:
    """Return list of SQL INSERTs for this video's parsed data + metadata marker."""
    stmts: list[str] = []

    if data is None:
        stmts.append(
            f"INSERT OR REPLACE INTO trailer_metadata "
            f"(movie_id, youtube_id, fetch_status, processed_at) VALUES "
            f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(fetch_status[:100])}, datetime('now'))"
        )
        return stmts

    for s in _parse_subtitles(data):
        stmts.append(
            f"INSERT OR IGNORE INTO trailer_subtitles "
            f"(movie_id, youtube_id, language, is_auto_generated, formats) VALUES "
            f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(s['language'])}, "
            f"{s['is_auto_generated']}, {sql_escape(s['formats'])})"
        )
    for t in _parse_audio_tracks(data):
        stmts.append(
            f"INSERT OR IGNORE INTO trailer_audio_tracks "
            f"(movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name) VALUES "
            f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(t['language'])}, "
            f"{t['is_original']}, {t['is_auto_dubbed']}, {sql_escape(t['display_name'])})"
        )
    for f in _parse_formats(data):
        stmts.append(
            f"INSERT OR IGNORE INTO trailer_formats "
            f"(movie_id, youtube_id, format_id, height, width, vcodec, acodec, fps, filesize) VALUES "
            f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(f['format_id'])}, "
            f"{sql_escape(f['height'])}, {sql_escape(f['width'])}, {sql_escape(f['vcodec'])}, "
            f"{sql_escape(f['acodec'])}, {sql_escape(f['fps'])}, {sql_escape(f['filesize'])})"
        )
    mf = _parse_microformat(data)
    for cc in mf["available_countries"]:
        stmts.append(
            f"INSERT OR IGNORE INTO trailer_availability (movie_id, youtube_id, country_code) VALUES "
            f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(cc)})"
        )
    chapters = _parse_chapters(data)
    stmts.append(
        f"INSERT OR REPLACE INTO trailer_metadata "
        f"(movie_id, youtube_id, category, upload_date, publish_date, is_family_safe, is_unlisted, "
        f"is_private, available_country_count, has_chapters, chapters_json, length_seconds, "
        f"view_count_snapshot, fetch_status, processed_at) VALUES "
        f"({movie_id}, {sql_escape(youtube_id)}, {sql_escape(mf['category'])}, "
        f"{sql_escape(mf['upload_date'])}, {sql_escape(mf['publish_date'])}, "
        f"{mf['is_family_safe']}, {mf['is_unlisted']}, {mf['is_private']}, "
        f"{sql_escape(mf['available_country_count'])}, {1 if chapters else 0}, "
        f"{sql_escape(json.dumps(chapters) if chapters else None)}, "
        f"{sql_escape(mf['length_seconds'])}, {sql_escape(mf['view_count_snapshot'])}, "
        f"'ok', datetime('now'))"
    )
    return stmts


# ---------------------------------------------------------------------------
# Async orchestration
# ---------------------------------------------------------------------------

class CircuitBreaker:
    def __init__(self, window, err_rate, pause_s):
        self.window = window
        self.err_rate = err_rate
        self.pause_s = pause_s
        self.history = deque(maxlen=window)
        self.paused_until = 0.0
        self.lock = asyncio.Lock()

    def record(self, is_error):
        self.history.append(1 if is_error else 0)

    async def check(self):
        async with self.lock:
            now = time.monotonic()
            if now < self.paused_until:
                await asyncio.sleep(self.paused_until - now)
                return
            if len(self.history) >= self.window:
                rate = sum(self.history) / len(self.history)
                if rate >= self.err_rate:
                    self.paused_until = now + self.pause_s
                    self.history.clear()
                    logger.warning(f"CIRCUIT BREAKER tripped: error rate {rate:.1%}. Pausing {self.pause_s:.0f}s")
                    await asyncio.sleep(self.pause_s)


async def _worker(name, session, queue, buffer, buffer_lock, stats, breaker):
    while True:
        item = await queue.get()
        if item is None:
            queue.task_done()
            return
        movie_id, youtube_id = item
        await breaker.check()
        try:
            data, reason = await _fetch_player(session, youtube_id)
            stmts = build_statements(movie_id, youtube_id, data, reason)
            async with buffer_lock:
                buffer.extend(stmts)
                stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
                if data is None:
                    stats["errors"] += 1
                    breaker.record(True)
                else:
                    ns = len(_parse_subtitles(data))
                    na = len(_parse_audio_tracks(data))
                    mf = _parse_microformat(data)
                    if ns:
                        stats["subtitled"] += 1
                    if na > 1:
                        stats["multi_audio"] += 1
                    if mf["available_country_count"]:
                        stats["with_geo"] += 1
                    breaker.record(False)
                stats["processed"] += 1
        except Exception as e:
            logger.debug(f"worker {name} error on {youtube_id}: {e}")
            async with buffer_lock:
                buffer.extend(build_statements(movie_id, youtube_id, None, f"exc:{type(e).__name__}"))
                stats["errors"] += 1
                stats["reasons"]["worker_exc"] = stats["reasons"].get("worker_exc", 0) + 1
                stats["processed"] += 1
                breaker.record(True)
        finally:
            queue.task_done()
            await asyncio.sleep(random.uniform(JITTER_MIN, JITTER_MAX))


async def _flusher(buffer, buffer_lock, stats, stop_event, loop):
    """Periodically flush buffered statements to D1 in batches."""
    while not stop_event.is_set() or buffer:
        await asyncio.sleep(2.0)
        async with buffer_lock:
            if len(buffer) < FLUSH_EVERY and not stop_event.is_set():
                continue
            pending = list(buffer)
            buffer.clear()
        # Flush in chunks via D1 batch endpoint (sync, run in thread)
        for i in range(0, len(pending), D1_STMTS_PER_BATCH):
            chunk = pending[i:i + D1_STMTS_PER_BATCH]
            try:
                await loop.run_in_executor(None, d1_batch, chunk)
                stats["flushed"] += len(chunk)
            except Exception as e:
                logger.error(f"D1 flush failed: {e}")
                stats["flush_errors"] += 1
                # Retry once after brief delay
                await asyncio.sleep(3.0)
                try:
                    await loop.run_in_executor(None, d1_batch, chunk)
                    stats["flushed"] += len(chunk)
                except Exception as e2:
                    logger.error(f"D1 flush retry failed ({len(chunk)} stmts dropped): {e2}")


async def _progress_reporter(stats, total, start, stop_event):
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=15.0)
            return
        except asyncio.TimeoutError:
            pass
        elapsed = time.monotonic() - start
        p = stats["processed"]
        rate = p / elapsed if elapsed > 0 else 0
        remaining = (total - p) / rate if rate > 0 else 0
        mins, secs = divmod(int(remaining), 60)
        hours, mins = divmod(mins, 60)
        eta = f"{hours}h {mins:02d}m" if hours else f"{mins}m {secs:02d}s"
        top = sorted(stats["reasons"].items(), key=lambda x: -x[1])[:4]
        reasons = ", ".join(f"{k}={v}" for k, v in top) if top else "-"
        logger.info(
            f"Proc: {p:,}/{total:,} | Subs: {stats['subtitled']:,} | "
            f"Multi-audio: {stats['multi_audio']:,} | Geo: {stats['with_geo']:,} | "
            f"Err: {stats['errors']:,} ({reasons}) | "
            f"Flushed: {stats['flushed']:,} | {rate:.1f}/s | ETA: {eta}"
        )


async def run_shard(shard_id: int, total_shards: int):
    if not (CF_API_TOKEN and CF_ACCOUNT_ID and D1_DATABASE_ID):
        logger.error("Missing CF env vars (CF_API_TOKEN, CF_ACCOUNT_ID, D1_DATABASE_ID)")
        sys.exit(1)

    logger.info(f"=== Phase 7 shard {shard_id}/{total_shards} ===")

    # Step 1: fetch all undone youtube_ids from D1
    logger.info("Fetching undone trailer list from D1...")
    rows = d1_query(
        "SELECT t.youtube_id, t.movie_id FROM trailers t "
        "LEFT JOIN trailer_metadata tm ON tm.youtube_id = t.youtube_id "
        "WHERE t.is_available = 1 AND tm.id IS NULL"
    )
    logger.info(f"D1 has {len(rows):,} undone trailers total")

    # Step 2: filter to this shard by stable hash
    my_rows = []
    for r in rows:
        yid = r["youtube_id"]
        h = int(hashlib.md5(yid.encode()).hexdigest(), 16)
        if h % total_shards == shard_id:
            my_rows.append((r["movie_id"], yid))

    total = len(my_rows)
    logger.info(f"Shard {shard_id}: {total:,} videos to process")
    if not total:
        return

    stats = {
        "processed": 0, "subtitled": 0, "multi_audio": 0, "with_geo": 0,
        "errors": 0, "flushed": 0, "flush_errors": 0, "reasons": {},
    }
    start = time.monotonic()
    queue = asyncio.Queue(maxsize=CONCURRENCY * 4)
    buffer: list[str] = []
    buffer_lock = asyncio.Lock()
    stop_event = asyncio.Event()
    breaker = CircuitBreaker(CB_WINDOW, CB_ERR_RATE, CB_PAUSE_SECONDS)
    loop = asyncio.get_event_loop()

    connector = aiohttp.TCPConnector(limit=CONCURRENCY * 2, ttl_dns_cache=300)
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(connector=connector, cookie_jar=jar) as session:
        jar.update_cookies({"CONSENT": "YES+cb.20210328-17-p0.en+FX+999"})
        await _warm_session(session)
        logger.info("Session warmed")

        workers = [
            asyncio.create_task(_worker(i, session, queue, buffer, buffer_lock, stats, breaker))
            for i in range(CONCURRENCY)
        ]
        flusher = asyncio.create_task(_flusher(buffer, buffer_lock, stats, stop_event, loop))
        reporter = asyncio.create_task(_progress_reporter(stats, total, start, stop_event))

        for mid, yid in my_rows:
            await queue.put((mid, yid))
        for _ in range(CONCURRENCY):
            await queue.put(None)

        await asyncio.gather(*workers)
        stop_event.set()
        await flusher
        await reporter

    # Final flush safety net
    if buffer:
        logger.info(f"Final flush: {len(buffer)} residual statements")
        for i in range(0, len(buffer), D1_STMTS_PER_BATCH):
            try:
                d1_batch(buffer[i:i + D1_STMTS_PER_BATCH])
            except Exception as e:
                logger.error(f"Final flush failed: {e}")

    elapsed = time.monotonic() - start
    h, r = divmod(int(elapsed), 3600)
    m, s = divmod(r, 60)
    logger.info(
        f"=== Shard {shard_id} complete: {stats['processed']:,} processed, "
        f"{stats['subtitled']:,} subtitled, {stats['multi_audio']:,} multi-audio, "
        f"{stats['with_geo']:,} geo, {stats['errors']:,} errors, "
        f"{stats['flushed']:,} stmts flushed in {h}h {m:02d}m {s:02d}s ==="
    )


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--shard", type=int, required=True)
    parser.add_argument("--total", type=int, required=True)
    args = parser.parse_args()
    if args.shard < 0 or args.shard >= args.total:
        logger.error(f"Invalid shard {args.shard} for total {args.total}")
        sys.exit(1)
    asyncio.run(run_shard(args.shard, args.total))


if __name__ == "__main__":
    main()
