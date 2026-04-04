"""Phase 7: Collect subtitle tracks, audio tracks, and formats for trailers via yt-dlp."""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from yt_dlp import YoutubeDL

from pipeline.db import get_connection

logger = logging.getLogger(__name__)

# Rate limit: 1 request per 2.5 seconds to avoid YouTube throttling
REQUEST_INTERVAL = 0.5
COMMIT_EVERY = 50

YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "ignoreerrors": True,
}


def _extract_info(youtube_id: str) -> dict | None:
    """Synchronous yt-dlp extraction (runs in thread pool)."""
    try:
        with YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(
                f"https://youtube.com/watch?v={youtube_id}", download=False
            )
            return info
    except Exception:
        return None


def _parse_subtitles(info: dict) -> list[dict]:
    """Parse manual and auto-generated subtitle tracks from yt-dlp info."""
    results = []

    manual_subs = info.get("subtitles") or {}
    for lang, entries in manual_subs.items():
        formats_list = [e.get("ext", "") for e in (entries or []) if e]
        results.append(
            {
                "language": lang,
                "is_auto_generated": 0,
                "formats": ",".join(sorted(set(formats_list))) if formats_list else None,
            }
        )

    auto_subs = info.get("automatic_captions") or {}
    for lang, entries in auto_subs.items():
        formats_list = [e.get("ext", "") for e in (entries or []) if e]
        results.append(
            {
                "language": lang,
                "is_auto_generated": 1,
                "formats": ",".join(sorted(set(formats_list))) if formats_list else None,
            }
        )

    return results


def _parse_audio_tracks(info: dict) -> list[dict]:
    """Extract unique audio tracks from format entries."""
    seen = {}
    for fmt in info.get("formats") or []:
        track = fmt.get("audio_track")
        if not track:
            continue

        lang = track.get("id", "")
        if not lang or lang in seen:
            continue

        display_name = track.get("display_name", "")
        is_default = track.get("is_default", False)

        # Detect auto-dubbed: display_name contains "auto" (case-insensitive)
        is_auto_dubbed = 1 if "auto" in display_name.lower() else 0

        # Detect original: is_default or display_name contains "original"
        is_original = 1 if (is_default or "original" in display_name.lower()) else 0

        seen[lang] = {
            "language": lang,
            "is_original": is_original,
            "is_auto_dubbed": is_auto_dubbed,
            "display_name": display_name or None,
        }

    return list(seen.values())


def _parse_formats(info: dict) -> list[dict]:
    """Extract unique format combinations (deduplicated by format_id)."""
    results = []
    seen_ids = set()

    for fmt in info.get("formats") or []:
        fmt_id = fmt.get("format_id")
        if not fmt_id or fmt_id in seen_ids:
            continue
        seen_ids.add(fmt_id)

        results.append(
            {
                "format_id": fmt_id,
                "height": fmt.get("height"),
                "width": fmt.get("width"),
                "vcodec": fmt.get("vcodec") if fmt.get("vcodec") != "none" else None,
                "acodec": fmt.get("acodec") if fmt.get("acodec") != "none" else None,
                "fps": fmt.get("fps"),
                "filesize": fmt.get("filesize") or fmt.get("filesize_approx"),
            }
        )

    return results


async def _insert_subtitle_data(db, movie_id: int, youtube_id: str, info: dict):
    """Insert parsed subtitle, audio, and format data into the database."""
    subtitles = _parse_subtitles(info)
    for sub in subtitles:
        await db.execute(
            """INSERT OR IGNORE INTO trailer_subtitles
               (movie_id, youtube_id, language, is_auto_generated, formats)
               VALUES (?, ?, ?, ?, ?)""",
            (movie_id, youtube_id, sub["language"], sub["is_auto_generated"], sub["formats"]),
        )

    audio_tracks = _parse_audio_tracks(info)
    for track in audio_tracks:
        await db.execute(
            """INSERT OR IGNORE INTO trailer_audio_tracks
               (movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                movie_id,
                youtube_id,
                track["language"],
                track["is_original"],
                track["is_auto_dubbed"],
                track["display_name"],
            ),
        )

    formats = _parse_formats(info)
    for f in formats:
        await db.execute(
            """INSERT OR IGNORE INTO trailer_formats
               (movie_id, youtube_id, format_id, height, width, vcodec, acodec, fps, filesize)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                movie_id,
                youtube_id,
                f["format_id"],
                f["height"],
                f["width"],
                f["vcodec"],
                f["acodec"],
                f["fps"],
                f["filesize"],
            ),
        )


async def run(top_n: int | None = None):
    """Execute Phase 7: Subtitle & Audio Track metadata collection.

    Args:
        top_n: If set, only process trailers for the top N movies by IMDb votes.
    """
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 7: Subtitle & Audio Track Metadata Collection ===")

    if top_n:
        logger.info(f"Mode: Top {top_n:,} movies by IMDb votes")

    db = await get_connection()

    # Ensure new tables exist
    from pipeline.db import SCHEMA
    await db.executescript(SCHEMA)

    # Get all unique youtube_ids with their movie_ids that haven't been processed yet.
    # LEFT JOIN on trailer_subtitles to find unprocessed ones.
    # We also LEFT JOIN on trailer_audio_tracks and trailer_formats to be thorough --
    # a video is "processed" if it appears in ANY of the three target tables.
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

    # If top_n, also limit by number of unique movies
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

    start_time = time.monotonic()
    processed = 0
    subtitled_count = 0
    multi_audio_count = 0
    error_count = 0
    last_request_time = 0.0

    executor = ThreadPoolExecutor(max_workers=1)
    loop = asyncio.get_event_loop()

    for i, row in enumerate(rows):
        youtube_id = row["youtube_id"]
        movie_id = row["movie_id"]

        # Rate limiting: ensure minimum interval between requests
        now = time.monotonic()
        elapsed_since_last = now - last_request_time
        if elapsed_since_last < REQUEST_INTERVAL:
            await asyncio.sleep(REQUEST_INTERVAL - elapsed_since_last)

        last_request_time = time.monotonic()

        try:
            # Run yt-dlp in thread pool to avoid blocking the event loop
            info = await loop.run_in_executor(executor, _extract_info, youtube_id)

            if info is None:
                # Video unavailable (age-restricted, geo-blocked, taken down, etc.)
                error_count += 1
                # Insert a sentinel row so we don't retry this video
                await db.execute(
                    """INSERT OR IGNORE INTO trailer_subtitles
                       (movie_id, youtube_id, language, is_auto_generated, formats)
                       VALUES (?, ?, '__unavailable__', 0, NULL)""",
                    (movie_id, youtube_id),
                )
            else:
                await _insert_subtitle_data(db, movie_id, youtube_id, info)

                # Track stats
                manual_subs = info.get("subtitles") or {}
                auto_subs = info.get("automatic_captions") or {}
                if manual_subs or auto_subs:
                    subtitled_count += 1

                audio_tracks = _parse_audio_tracks(info)
                if len(audio_tracks) > 1:
                    multi_audio_count += 1

            processed += 1

            # Commit periodically
            if processed % COMMIT_EVERY == 0:
                await db.commit()

            # Progress display
            if processed % 10 == 0 or processed == total:
                elapsed = time.monotonic() - start_time
                rate = processed / elapsed if elapsed > 0 else 0
                remaining = (total - processed) / rate if rate > 0 else 0
                mins, secs = divmod(int(remaining), 60)
                hours, mins = divmod(mins, 60)
                eta = f"{hours}h {mins:02d}m" if hours else f"{mins}m {secs:02d}s"
                logger.info(
                    f"Processed: {processed:,}/{total:,} | "
                    f"Subtitled: {subtitled_count:,} | "
                    f"Multi-audio: {multi_audio_count:,} | "
                    f"Errors: {error_count:,} | "
                    f"ETA: {eta}"
                )

        except Exception as e:
            error_count += 1
            logger.error(f"Error processing {youtube_id}: {e}")
            # Insert sentinel to avoid retrying
            try:
                await db.execute(
                    """INSERT OR IGNORE INTO trailer_subtitles
                       (movie_id, youtube_id, language, is_auto_generated, formats)
                       VALUES (?, ?, '__error__', 0, NULL)""",
                    (movie_id, youtube_id),
                )
            except Exception:
                pass

    await db.commit()
    executor.shutdown(wait=False)

    elapsed_total = time.monotonic() - start_time
    hours, remainder = divmod(int(elapsed_total), 3600)
    mins, secs = divmod(remainder, 60)

    logger.info(
        f"=== Phase 7 complete: {processed:,} processed, "
        f"{subtitled_count:,} subtitled, {multi_audio_count:,} multi-audio, "
        f"{error_count:,} errors in {hours}h {mins:02d}m {secs:02d}s ==="
    )
    await db.close()
