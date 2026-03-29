"""Phase 6: Collect trailers and metadata for all TV series from TMDB."""

import asyncio
import logging

import aiohttp

from pipeline.config import TMDB_API_KEY, TMDB_BASE_URL, TMDB_RATE_LIMIT
from pipeline.db import get_connection
from pipeline.rate_limiter import RateLimiter
from pipeline.job_tracker import JobTracker
from pipeline.type_classifier import classify_trailer_type

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
CONCURRENT = 20


async def fetch_series_details(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
) -> dict | None:
    """Fetch TV series details + videos from TMDB. Returns full response."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/tv/{tmdb_id}"
    params = {
        "api_key": TMDB_API_KEY,
        "language": "en-US",
        "append_to_response": "videos",
    }

    async with session.get(url, params=params) as resp:
        if resp.status == 429:
            limiter.on_429()
            raise Exception("Rate limited (429)")
        if resp.status == 404:
            return None
        if resp.status != 200:
            raise Exception(f"HTTP {resp.status}")

        limiter.on_success()
        return await resp.json()


async def process_series(
    session: aiohttp.ClientSession,
    db,
    limiter: RateLimiter,
    tracker: JobTracker,
    job: dict,
):
    """Process a single series: fetch details + videos, store trailers."""
    job_id = job["id"]
    tmdb_id_str = job["imdb_id"]  # We store tmdb_id in the imdb_id field for series
    tmdb_id = int(tmdb_id_str)

    await tracker.mark_in_progress(job_id)

    try:
        data = await fetch_series_details(session, limiter, tmdb_id)
        if data is None:
            await tracker.mark_skipped(job_id)
            return

        # Update series metadata
        await db.execute(
            """UPDATE series SET
                name = COALESCE(?, name),
                original_name = ?,
                first_air_date = ?,
                overview = ?,
                poster_path = ?,
                backdrop_path = ?,
                status = ?,
                number_of_seasons = ?,
                vote_average = ?,
                vote_count = ?,
                popularity = ?,
                original_language = ?,
                updated_at = datetime('now')
               WHERE tmdb_id = ?""",
            (
                data.get("name"),
                data.get("original_name"),
                data.get("first_air_date"),
                data.get("overview"),
                data.get("poster_path"),
                data.get("backdrop_path"),
                data.get("status"),
                data.get("number_of_seasons"),
                data.get("vote_average"),
                data.get("vote_count"),
                data.get("popularity"),
                data.get("original_language"),
                tmdb_id,
            ),
        )

        # Get the internal series ID
        series_cursor = await db.execute("SELECT id FROM series WHERE tmdb_id = ?", (tmdb_id,))
        series_row = await series_cursor.fetchone()
        if series_row is None:
            await tracker.mark_skipped(job_id)
            return
        series_id = series_row["id"]

        # Store genres (reuse the shared genres table)
        for genre in data.get("genres", []):
            await db.execute(
                "INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)",
                (genre["id"], genre["name"]),
            )
            await db.execute(
                "INSERT OR IGNORE INTO series_genres (series_id, genre_id) VALUES (?, ?)",
                (series_id, genre["id"]),
            )

        # Store trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_count = 0
        for video in videos:
            if video.get("site") != "YouTube":
                continue

            trailer_type = classify_trailer_type(video.get("type", ""), video.get("name", ""))

            await db.execute(
                """INSERT OR IGNORE INTO series_trailers
                   (series_id, youtube_id, title, trailer_type, language, region,
                    is_official, quality, published_at, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tmdb')""",
                (
                    series_id,
                    video["key"],
                    video.get("name"),
                    trailer_type,
                    video.get("iso_639_1"),
                    video.get("iso_3166_1"),
                    1 if video.get("official", True) else 0,
                    video.get("size"),
                    video.get("published_at"),
                ),
            )
            trailer_count += 1

        await tracker.mark_complete(job_id)

    except Exception as e:
        await tracker.mark_failed(job_id, str(e))
        if "429" in str(e):
            await asyncio.sleep(2)


async def get_pending_series(db, phase: str, limit: int = 1000) -> list[dict]:
    """Get next batch of pending or retryable series jobs.

    Custom query because series jobs use imdb_id to store the tmdb_id
    and don't join on the movies table.
    """
    cursor = await db.execute(
        """SELECT l.id, l.imdb_id, l.phase
           FROM ingestion_log l
           WHERE l.phase = ?
             AND (l.status = 'pending' OR (l.status = 'failed' AND l.attempts < 3))
           ORDER BY l.id ASC
           LIMIT ?""",
        (phase, limit),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def run():
    """Execute Phase 6: Series Video Collection."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 6: Series Video Collection ===")

    db = await get_connection()
    tracker = JobTracker(db)

    # Check progress
    progress = await tracker.get_progress("series_videos")

    logger.info(f"Total: {progress['total']:,} | Done: {progress['done']:,} | Remaining: {progress['remaining']:,}")

    if progress["total"] == 0:
        logger.info("No Phase 6 jobs found. Run phase5 first to bootstrap series.")
        await db.close()
        return

    if progress["remaining"] == 0:
        logger.info("No pending jobs. Phase 6 complete.")
        await db.close()
        return

    tracker.start_timer(progress["remaining"])

    sem = asyncio.Semaphore(CONCURRENT)

    async with aiohttp.ClientSession() as session:
        while True:
            jobs = await get_pending_series(db, "series_videos", limit=BATCH_SIZE)
            if not jobs:
                break

            async def do_one(job):
                async with sem:
                    await process_series(session, db, limiter, tracker, job)

            limiter = RateLimiter(TMDB_RATE_LIMIT)
            await asyncio.gather(*[do_one(j) for j in jobs])
            await db.commit()
            logger.info(f"Progress: {tracker.progress_line()}")

    # Summary
    cursor = await db.execute("SELECT COUNT(*) FROM series_trailers")
    total_trailers = (await cursor.fetchone())[0]
    logger.info(f"=== Phase 6 complete: {total_trailers:,} total series trailers in database ===")

    await db.close()
