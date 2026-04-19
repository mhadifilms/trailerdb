"""Phase 7: Collect subtitle tracks, audio tracks, and formats via YouTube watch-page scrape.

Fetches https://www.youtube.com/watch?v=ID and extracts the `ytInitialPlayerResponse`
JSON blob embedded in the HTML. ~50-100x faster than yt-dlp because it skips JS player
execution, signature decryption, and most network round-trips.
"""

import asyncio
import json
import logging
import random
import re
import time

import aiohttp

from pipeline.db import get_connection

logger = logging.getLogger(__name__)

WATCH_URL = "https://www.youtube.com/watch?v={video_id}"
CONCURRENCY = 8
JITTER_MIN = 0.0
JITTER_MAX = 0.15
MAX_RETRIES = 2
BACKOFF_BASE = 4.0
COMMIT_EVERY = 50
REQUEST_TIMEOUT = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

PLAYER_RE = re.compile(r"ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;")


async def _fetch_player(session: aiohttp.ClientSession, youtube_id: str) -> tuple[dict | None, str]:
    """Fetch watch page with retry. Returns (data|None, reason_tag)."""
    url = WATCH_URL.format(video_id=youtube_id)
    last_reason = "unknown"
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with session.get(
                url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                status_code = resp.status
                if status_code == 429 or status_code >= 500:
                    last_reason = f"http_{status_code}"
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 1.5))
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
            return None, f"net:{type(e).__name__}"

        m = PLAYER_RE.search(html)
        if not m:
            # Challenge / captcha page. Retry with backoff.
            last_reason = "no_player_json"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 1.5))
                continue
            return None, last_reason
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            return None, "bad_json"

        status = (data.get("playabilityStatus") or {}).get("status")
        if status not in ("OK", "LIVE_STREAM_OFFLINE"):
            return None, f"playability:{status}"
        return data, "ok"

    return None, last_reason


def _parse_subtitles(data: dict) -> list[dict]:
    """Parse caption tracks from InnerTube response."""
    captions = (data.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
    tracks = captions.get("captionTracks") or []
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
            {
                "language": lang,
                "is_auto_generated": is_auto,
                "formats": "vtt,srt,ttml",
            }
        )
    return results


def _parse_audio_tracks(data: dict) -> list[dict]:
    """Extract audio tracks from adaptiveFormats."""
    streaming = data.get("streamingData") or {}
    formats = streaming.get("adaptiveFormats") or []
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
    """Extract format metadata from adaptiveFormats + formats."""
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
        vcodec = codec if is_video else None
        acodec = codec if is_audio else None
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
                "vcodec": vcodec,
                "acodec": acodec,
                "fps": fmt.get("fps"),
                "filesize": filesize,
            }
        )
    return results


async def _insert_data(db, movie_id: int, youtube_id: str, data: dict):
    """Insert parsed subtitle, audio, and format data."""
    for sub in _parse_subtitles(data):
        await db.execute(
            """INSERT OR IGNORE INTO trailer_subtitles
               (movie_id, youtube_id, language, is_auto_generated, formats)
               VALUES (?, ?, ?, ?, ?)""",
            (movie_id, youtube_id, sub["language"], sub["is_auto_generated"], sub["formats"]),
        )
    for t in _parse_audio_tracks(data):
        await db.execute(
            """INSERT OR IGNORE INTO trailer_audio_tracks
               (movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (movie_id, youtube_id, t["language"], t["is_original"], t["is_auto_dubbed"], t["display_name"]),
        )
    for f in _parse_formats(data):
        await db.execute(
            """INSERT OR IGNORE INTO trailer_formats
               (movie_id, youtube_id, format_id, height, width, vcodec, acodec, fps, filesize)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                movie_id, youtube_id, f["format_id"], f["height"], f["width"],
                f["vcodec"], f["acodec"], f["fps"], f["filesize"],
            ),
        )


async def _insert_sentinel(db, movie_id: int, youtube_id: str, label: str):
    """Insert a sentinel row so we skip unavailable videos on re-run."""
    try:
        await db.execute(
            """INSERT OR IGNORE INTO trailer_subtitles
               (movie_id, youtube_id, language, is_auto_generated, formats)
               VALUES (?, ?, ?, 0, NULL)""",
            (movie_id, youtube_id, label),
        )
    except Exception:
        pass


async def _worker(
    name: int,
    session: aiohttp.ClientSession,
    queue: asyncio.Queue,
    db,
    db_lock: asyncio.Lock,
    stats: dict,
):
    """Fetch videos from queue, parse, and insert. Jitters between requests."""
    while True:
        item = await queue.get()
        if item is None:
            queue.task_done()
            return
        movie_id, youtube_id = item
        try:
            data, reason = await _fetch_player(session, youtube_id)
            async with db_lock:
                if data is None:
                    await _insert_sentinel(db, movie_id, youtube_id, "__unavailable__")
                    stats["errors"] += 1
                    stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
                else:
                    await _insert_data(db, movie_id, youtube_id, data)
                    subs = _parse_subtitles(data)
                    audio = _parse_audio_tracks(data)
                    if subs:
                        stats["subtitled"] += 1
                    if len(audio) > 1:
                        stats["multi_audio"] += 1
                stats["processed"] += 1
                if stats["processed"] % COMMIT_EVERY == 0:
                    await db.commit()
        except Exception as e:
            async with db_lock:
                await _insert_sentinel(db, movie_id, youtube_id, "__error__")
                stats["errors"] += 1
                stats["reasons"]["worker_exc"] = stats["reasons"].get("worker_exc", 0) + 1
                stats["processed"] += 1
            logger.debug(f"worker {name} error on {youtube_id}: {e}")
        finally:
            queue.task_done()
            await asyncio.sleep(random.uniform(JITTER_MIN, JITTER_MAX))


async def _progress_reporter(stats: dict, total: int, start: float, stop: asyncio.Event):
    """Log progress every 5s until stop is set."""
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=5.0)
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
        top_reasons = sorted(stats["reasons"].items(), key=lambda x: -x[1])[:3]
        reasons_str = ", ".join(f"{k}={v}" for k, v in top_reasons) if top_reasons else "-"
        logger.info(
            f"Processed: {p:,}/{total:,} | "
            f"Subtitled: {stats['subtitled']:,} | "
            f"Multi-audio: {stats['multi_audio']:,} | "
            f"Errors: {stats['errors']:,} ({reasons_str}) | "
            f"Rate: {rate:.1f}/s | ETA: {eta}"
        )


async def run(top_n: int | None = None):
    """Execute Phase 7: Subtitle & Audio Track metadata collection via InnerTube."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 7: Subtitle & Audio Track (watch-page scrape) ===")
    if top_n:
        logger.info(f"Mode: Top {top_n:,} movies by IMDb votes")

    db = await get_connection()

    from pipeline.db import SCHEMA
    await db.executescript(SCHEMA)

    if top_n:
        query = """
            SELECT DISTINCT t.youtube_id, t.movie_id, m.imdb_votes
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_subtitles ts ON ts.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND ts.id IS NULL
              AND m.imdb_votes IS NOT NULL
            ORDER BY m.imdb_votes DESC
            LIMIT ?
        """
        cursor = await db.execute(query, (top_n * 5,))
    else:
        query = """
            SELECT DISTINCT t.youtube_id, t.movie_id, m.imdb_votes
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_subtitles ts ON ts.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND ts.id IS NULL
            ORDER BY m.imdb_votes DESC NULLS LAST
        """
        cursor = await db.execute(query)

    rows = await cursor.fetchall()

    if top_n:
        filtered = []
        seen_movies = set()
        for r in rows:
            mid = r["movie_id"]
            if mid not in seen_movies:
                seen_movies.add(mid)
            if len(seen_movies) <= top_n:
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

    stats = {"processed": 0, "subtitled": 0, "multi_audio": 0, "errors": 0, "reasons": {}}
    start_time = time.monotonic()

    queue: asyncio.Queue = asyncio.Queue(maxsize=CONCURRENCY * 4)
    db_lock = asyncio.Lock()
    stop_event = asyncio.Event()

    connector = aiohttp.TCPConnector(limit=CONCURRENCY * 2, ttl_dns_cache=300)
    async with aiohttp.ClientSession(connector=connector) as session:
        workers = [
            asyncio.create_task(_worker(i, session, queue, db, db_lock, stats))
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
        f"{stats['errors']:,} errors in {hours}h {mins:02d}m {secs:02d}s ==="
    )
    await db.close()
