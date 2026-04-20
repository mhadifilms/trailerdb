"""Phase 7: Rich trailer metadata via YouTube watch-page scrape.

Captures per-trailer:
  - Subtitle tracks (languages + auto/manual)
  - Audio tracks (including multi-language dubs)
  - Video formats (resolution, codec, bitrate)
  - Microformat (category, upload date, family-safe, private/unlisted)
  - Regional availability (list of country codes where the video plays)
  - Chapters (when provided by the uploader)

Anti-abuse hardening:
  - Warm session with CONSENT cookie + visitor-info priming on first request
  - Rotating realistic desktop User-Agents
  - Retries with exponential backoff on UNPLAYABLE (YouTube's fake-rejection signal
    when it suspects automation), HTTP 429, 5xx, and missing player JSON
  - Circuit breaker: pauses all workers when rolling error rate spikes
  - "__fetched__" row in trailer_metadata acts as the processed marker so a restart
    never re-hits a good video, even if it had no subs/audio
"""

import asyncio
import json
import logging
import random
import re
import time
from collections import deque

import aiohttp

from pipeline.db import get_connection

logger = logging.getLogger(__name__)

WATCH_URL = "https://www.youtube.com/watch?v={video_id}&bpctr=9999999999&has_verified=1"
WARMUP_URL = "https://www.youtube.com/"
CONCURRENCY = 6
JITTER_MIN = 0.05
JITTER_MAX = 0.25
MAX_RETRIES = 4
BACKOFF_BASE = 2.5
COMMIT_EVERY = 50
REQUEST_TIMEOUT = 25

# Circuit breaker: pause when recent error rate exceeds threshold
CB_WINDOW = 120
CB_ERR_RATE = 0.35
CB_PAUSE_SECONDS = 180

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0",
]

BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

PLAYER_RE = re.compile(r"ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|</script>)")


def _headers() -> dict:
    h = dict(BASE_HEADERS)
    h["User-Agent"] = random.choice(USER_AGENTS)
    return h


async def _warm_session(session: aiohttp.ClientSession):
    """One-off GET to establish YouTube cookies (VISITOR_INFO1_LIVE, YSC, GPS)."""
    try:
        async with session.get(WARMUP_URL, headers=_headers(), timeout=aiohttp.ClientTimeout(total=15)):
            pass
    except Exception:
        pass


async def _fetch_player(session: aiohttp.ClientSession, youtube_id: str) -> tuple[dict | None, str]:
    """Fetch watch page with retry. Returns (player_response|None, reason_tag).

    Retries on: HTTP 429/5xx, timeouts, missing JSON, and UNPLAYABLE responses
    (often YouTube's anti-abuse signal rather than a real "video unavailable").
    Does NOT retry on LOGIN_REQUIRED (legit age-gate) or permanent errors.
    """
    url = WATCH_URL.format(video_id=youtube_id)
    last_reason = "unknown"

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with session.get(
                url, headers=_headers(), timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                status_code = resp.status
                if status_code == 429 or status_code >= 500:
                    last_reason = f"http_{status_code}"
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0.5, 2.0))
                        continue
                    return None, last_reason
                if status_code != 200:
                    return None, f"http_{status_code}"
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

        # Terminal rejections — do not retry, record sentinel with the reason.
        if ps in ("LOGIN_REQUIRED", "AGE_VERIFICATION_REQUIRED"):
            return None, f"playability:{ps}"

        # UNPLAYABLE / ERROR / CONTENT_CHECK_REQUIRED — these can be anti-abuse false
        # positives, so retry with backoff before declaring failure.
        last_reason = f"playability:{ps}"
        if attempt < MAX_RETRIES:
            await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(1.0, 3.0))
            continue
        return None, last_reason

    return None, last_reason


def _parse_subtitles(data: dict) -> list[dict]:
    pct = (data.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
    tracks = pct.get("captionTracks") or []
    results = []
    seen = set()
    for t in tracks:
        lang = t.get("languageCode")
        if not lang:
            continue
        is_auto = 1 if t.get("kind") == "asr" else 0
        key = (lang, is_auto)
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {"language": lang, "is_auto_generated": is_auto, "formats": "vtt,srt,ttml"}
        )
    return results


def _parse_audio_tracks(data: dict) -> list[dict]:
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
        dn_lower = display_name.lower()
        is_auto_dubbed = 1 if ("auto" in dn_lower or "dubbed" in dn_lower) else 0
        is_original = 1 if (is_default or "original" in dn_lower) else 0
        seen[lang] = {
            "language": lang,
            "is_original": is_original,
            "is_auto_dubbed": is_auto_dubbed,
            "display_name": display_name or None,
        }
    return list(seen.values())


def _parse_formats(data: dict) -> list[dict]:
    streaming = data.get("streamingData") or {}
    all_formats = (streaming.get("formats") or []) + (streaming.get("adaptiveFormats") or [])
    results = []
    seen_ids = set()
    for fmt in all_formats:
        itag = fmt.get("itag")
        if itag is None or itag in seen_ids:
            continue
        seen_ids.add(itag)
        mime = fmt.get("mimeType") or ""
        codec = ""
        if "codecs=" in mime:
            codec = mime.split("codecs=", 1)[1].strip('"')
        is_video = mime.startswith("video/")
        is_audio = mime.startswith("audio/")
        filesize = fmt.get("contentLength")
        try:
            filesize = int(filesize) if filesize else None
        except (ValueError, TypeError):
            filesize = None
        results.append(
            {
                "format_id": str(itag),
                "height": fmt.get("height"),
                "width": fmt.get("width"),
                "vcodec": codec if is_video else None,
                "acodec": codec if is_audio else None,
                "fps": fmt.get("fps"),
                "filesize": filesize,
            }
        )
    return results


def _parse_microformat(data: dict) -> dict:
    """Extract category, upload/publish dates, family-safe, unlisted, available countries."""
    mf = ((data.get("microformat") or {}).get("playerMicroformatRenderer")) or {}
    available_countries = mf.get("availableCountries") or []
    vd = data.get("videoDetails") or {}
    try:
        length = int(vd.get("lengthSeconds") or 0) or None
    except (ValueError, TypeError):
        length = None
    try:
        views = int(vd.get("viewCount") or 0) or None
    except (ValueError, TypeError):
        views = None
    return {
        "category": mf.get("category"),
        "upload_date": mf.get("uploadDate"),
        "publish_date": mf.get("publishDate"),
        "is_family_safe": 1 if mf.get("isFamilySafe") else 0,
        "is_unlisted": 1 if mf.get("isUnlisted") else 0,
        "is_private": 1 if vd.get("isPrivate") else 0,
        "available_countries": available_countries,
        "available_country_count": len(available_countries) or None,
        "length_seconds": length,
        "view_count_snapshot": views,
    }


def _parse_chapters(data: dict) -> list[dict]:
    """Extract chapter markers if present."""
    overlays = data.get("playerOverlays") or {}
    por = overlays.get("playerOverlayRenderer") or {}
    decorated = por.get("decoratedPlayerBarRenderer") or {}
    dpbr = decorated.get("decoratedPlayerBarRenderer") or {}
    pb = dpbr.get("playerBar") or {}
    mmpbr = pb.get("multiMarkersPlayerBarRenderer") or {}
    markers = mmpbr.get("markersMap") or []
    chapters = []
    for m in markers:
        key = m.get("key", "")
        if "chapter" not in key.lower() and "DESCRIPTION_CHAPTERS" not in key:
            continue
        value = m.get("value") or {}
        chapter_renderer = value.get("chapters") or []
        for c in chapter_renderer:
            cr = (c or {}).get("chapterRenderer") or {}
            title = (cr.get("title") or {}).get("simpleText")
            start_ms = cr.get("timeRangeStartMillis")
            if title is not None and start_ms is not None:
                chapters.append({"title": title, "start_ms": start_ms})
    return chapters


async def _insert_data(db, movie_id: int, youtube_id: str, data: dict):
    """Insert parsed rich data. Returns (n_subs, n_audio, n_formats, n_countries, n_chapters)."""
    subs = _parse_subtitles(data)
    audio = _parse_audio_tracks(data)
    fmts = _parse_formats(data)
    mf = _parse_microformat(data)
    chapters = _parse_chapters(data)

    for sub in subs:
        await db.execute(
            "INSERT OR IGNORE INTO trailer_subtitles "
            "(movie_id, youtube_id, language, is_auto_generated, formats) VALUES (?, ?, ?, ?, ?)",
            (movie_id, youtube_id, sub["language"], sub["is_auto_generated"], sub["formats"]),
        )
    for t in audio:
        await db.execute(
            "INSERT OR IGNORE INTO trailer_audio_tracks "
            "(movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (movie_id, youtube_id, t["language"], t["is_original"], t["is_auto_dubbed"], t["display_name"]),
        )
    for f in fmts:
        await db.execute(
            "INSERT OR IGNORE INTO trailer_formats "
            "(movie_id, youtube_id, format_id, height, width, vcodec, acodec, fps, filesize) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                movie_id, youtube_id, f["format_id"], f["height"], f["width"],
                f["vcodec"], f["acodec"], f["fps"], f["filesize"],
            ),
        )
    for cc in mf["available_countries"]:
        await db.execute(
            "INSERT OR IGNORE INTO trailer_availability (movie_id, youtube_id, country_code) VALUES (?, ?, ?)",
            (movie_id, youtube_id, cc),
        )
    await db.execute(
        "INSERT OR REPLACE INTO trailer_metadata "
        "(movie_id, youtube_id, category, upload_date, publish_date, is_family_safe, is_unlisted, "
        "is_private, available_country_count, has_chapters, chapters_json, length_seconds, "
        "view_count_snapshot, fetch_status, processed_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', datetime('now'))",
        (
            movie_id, youtube_id, mf["category"], mf["upload_date"], mf["publish_date"],
            mf["is_family_safe"], mf["is_unlisted"], mf["is_private"],
            mf["available_country_count"], 1 if chapters else 0,
            json.dumps(chapters) if chapters else None,
            mf["length_seconds"], mf["view_count_snapshot"],
        ),
    )
    return len(subs), len(audio), len(fmts), len(mf["available_countries"]), len(chapters)


async def _insert_failure_marker(db, movie_id: int, youtube_id: str, status: str):
    """Mark a video as permanently unreachable so we don't retry forever."""
    await db.execute(
        "INSERT OR REPLACE INTO trailer_metadata "
        "(movie_id, youtube_id, fetch_status, processed_at) VALUES (?, ?, ?, datetime('now'))",
        (movie_id, youtube_id, status[:100]),
    )


class CircuitBreaker:
    """Pause workers when recent error rate exceeds threshold."""

    def __init__(self, window: int, err_rate: float, pause_s: float):
        self.window = window
        self.err_rate = err_rate
        self.pause_s = pause_s
        self.history: deque[int] = deque(maxlen=window)  # 1 = error, 0 = ok
        self.paused_until = 0.0
        self.lock = asyncio.Lock()

    def record(self, is_error: bool):
        self.history.append(1 if is_error else 0)

    async def check(self):
        async with self.lock:
            now = time.monotonic()
            if now < self.paused_until:
                wait = self.paused_until - now
                logger.warning(f"Circuit breaker active; pausing for {wait:.0f}s")
                await asyncio.sleep(wait)
                return

            if len(self.history) >= self.window:
                rate = sum(self.history) / len(self.history)
                if rate >= self.err_rate:
                    self.paused_until = now + self.pause_s
                    self.history.clear()
                    logger.warning(
                        f"CIRCUIT BREAKER tripped: error rate {rate:.1%} >= {self.err_rate:.0%}. "
                        f"Pausing {self.pause_s:.0f}s"
                    )
                    await asyncio.sleep(self.pause_s)


async def _worker(
    name: int,
    session: aiohttp.ClientSession,
    queue: asyncio.Queue,
    db,
    db_lock: asyncio.Lock,
    stats: dict,
    breaker: CircuitBreaker,
):
    while True:
        item = await queue.get()
        if item is None:
            queue.task_done()
            return
        movie_id, youtube_id = item
        await breaker.check()
        try:
            data, reason = await _fetch_player(session, youtube_id)
            async with db_lock:
                if data is None:
                    await _insert_failure_marker(db, movie_id, youtube_id, reason)
                    stats["errors"] += 1
                    stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
                    breaker.record(True)
                else:
                    ns, na, nf, ncc, nch = await _insert_data(db, movie_id, youtube_id, data)
                    if ns:
                        stats["subtitled"] += 1
                    if na > 1:
                        stats["multi_audio"] += 1
                    if ncc:
                        stats["with_geo"] += 1
                    if nch:
                        stats["with_chapters"] += 1
                    stats["reasons"]["ok"] = stats["reasons"].get("ok", 0) + 1
                    breaker.record(False)
                stats["processed"] += 1
                if stats["processed"] % COMMIT_EVERY == 0:
                    await db.commit()
        except Exception as e:
            async with db_lock:
                try:
                    await _insert_failure_marker(db, movie_id, youtube_id, f"exc:{type(e).__name__}")
                except Exception:
                    pass
                stats["errors"] += 1
                stats["reasons"]["worker_exc"] = stats["reasons"].get("worker_exc", 0) + 1
                stats["processed"] += 1
                breaker.record(True)
            logger.debug(f"worker {name} error on {youtube_id}: {e}")
        finally:
            queue.task_done()
            await asyncio.sleep(random.uniform(JITTER_MIN, JITTER_MAX))


async def _progress_reporter(stats: dict, total: int, start: float, stop: asyncio.Event):
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=10.0)
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
        top_reasons = sorted(stats["reasons"].items(), key=lambda x: -x[1])[:4]
        reasons_str = ", ".join(f"{k}={v}" for k, v in top_reasons) if top_reasons else "-"
        logger.info(
            f"Proc: {p:,}/{total:,} | Subs: {stats['subtitled']:,} | "
            f"Multi-audio: {stats['multi_audio']:,} | Geo: {stats['with_geo']:,} | "
            f"Chapters: {stats['with_chapters']:,} | Err: {stats['errors']:,} "
            f"({reasons_str}) | {rate:.1f}/s | ETA: {eta}"
        )


async def run(top_n: int | None = None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 7: rich trailer metadata (watch-page scrape, hardened) ===")
    if top_n:
        logger.info(f"Mode: Top {top_n:,} movies by IMDb votes")

    db = await get_connection()
    from pipeline.db import SCHEMA
    await db.executescript(SCHEMA)

    # Query: anything NOT already in trailer_metadata (the new "processed" marker).
    # Fall back to old heuristic if trailer_metadata is empty.
    if top_n:
        cursor = await db.execute(
            """
            SELECT DISTINCT t.youtube_id, t.movie_id, m.imdb_votes
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_metadata tm ON tm.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND tm.id IS NULL
              AND m.imdb_votes IS NOT NULL
            ORDER BY m.imdb_votes DESC
            LIMIT ?
            """,
            (top_n * 5,),
        )
    else:
        cursor = await db.execute(
            """
            SELECT DISTINCT t.youtube_id, t.movie_id, m.imdb_votes
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_metadata tm ON tm.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND tm.id IS NULL
            ORDER BY m.imdb_votes DESC NULLS LAST
            """
        )
    rows = await cursor.fetchall()

    if top_n:
        filtered = []
        seen = set()
        for r in rows:
            mid = r["movie_id"]
            if mid not in seen:
                seen.add(mid)
            if len(seen) <= top_n:
                filtered.append(r)
            else:
                break
        rows = filtered

    total = len(rows)
    logger.info(f"Found {total:,} YouTube videos to process")
    if not rows:
        logger.info("Nothing to process. Phase 7 complete.")
        await db.close()
        return

    stats = {
        "processed": 0, "subtitled": 0, "multi_audio": 0,
        "with_geo": 0, "with_chapters": 0,
        "errors": 0, "reasons": {},
    }
    start_time = time.monotonic()

    queue: asyncio.Queue = asyncio.Queue(maxsize=CONCURRENCY * 4)
    db_lock = asyncio.Lock()
    stop_event = asyncio.Event()
    breaker = CircuitBreaker(CB_WINDOW, CB_ERR_RATE, CB_PAUSE_SECONDS)

    connector = aiohttp.TCPConnector(limit=CONCURRENCY * 2, ttl_dns_cache=300)
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(connector=connector, cookie_jar=jar) as session:
        jar.update_cookies({"CONSENT": "YES+cb.20210328-17-p0.en+FX+999"})
        await _warm_session(session)
        logger.info("Session warmed (consent cookie + visitor info set)")

        workers = [
            asyncio.create_task(_worker(i, session, queue, db, db_lock, stats, breaker))
            for i in range(CONCURRENCY)
        ]
        reporter = asyncio.create_task(_progress_reporter(stats, total, start_time, stop_event))

        for row in rows:
            await queue.put((row["movie_id"], row["youtube_id"]))
        for _ in range(CONCURRENCY):
            await queue.put(None)

        await asyncio.gather(*workers)
        stop_event.set()
        await reporter

    await db.commit()

    elapsed_total = time.monotonic() - start_time
    hours, remainder = divmod(int(elapsed_total), 3600)
    mins, secs = divmod(remainder, 60)
    logger.info(
        f"=== Phase 7 complete: {stats['processed']:,} processed, "
        f"{stats['subtitled']:,} subtitled, {stats['multi_audio']:,} multi-audio, "
        f"{stats['with_geo']:,} with geo, {stats['with_chapters']:,} with chapters, "
        f"{stats['errors']:,} errors in {hours}h {mins:02d}m {secs:02d}s ==="
    )
    await db.close()
