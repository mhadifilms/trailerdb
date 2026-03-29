"""Phase 2a: Collect English trailers from TMDB for all movies with a tmdb_id."""

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


async def fetch_movie_videos(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
) -> dict | None:
    """Fetch movie details + videos from TMDB. Returns full response."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
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


async def process_movie(
    session: aiohttp.ClientSession,
    db,
    limiter: RateLimiter,
    tracker: JobTracker,
    job: dict,
):
    """Process a single movie: fetch details + videos, store trailers."""
    job_id = job["id"]
    imdb_id = job["imdb_id"]
    tmdb_id = job["tmdb_id"]

    if tmdb_id is None:
        await tracker.mark_skipped(job_id)
        return

    await tracker.mark_in_progress(job_id)

    try:
        data = await fetch_movie_videos(session, limiter, tmdb_id)
        if data is None:
            await tracker.mark_skipped(job_id)
            return

        # Update movie metadata
        await db.execute(
            """UPDATE movies SET
                original_title = ?, tmdb_popularity = ?, poster_path = ?,
                backdrop_path = ?, overview = ?, runtime = ?,
                original_language = ?, updated_at = datetime('now')
               WHERE imdb_id = ?""",
            (
                data.get("original_title"),
                data.get("popularity"),
                data.get("poster_path"),
                data.get("backdrop_path"),
                data.get("overview"),
                data.get("runtime"),
                data.get("original_language"),
                imdb_id,
            ),
        )

        # Store genres
        movie_cursor = await db.execute("SELECT id FROM movies WHERE imdb_id = ?", (imdb_id,))
        movie_row = await movie_cursor.fetchone()
        movie_id = movie_row["id"]

        for genre in data.get("genres", []):
            await db.execute(
                "INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)",
                (genre["id"], genre["name"]),
            )
            await db.execute(
                "INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)",
                (movie_id, genre["id"]),
            )

        # Store trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_count = 0
        for video in videos:
            if video.get("site") != "YouTube":
                continue

            trailer_type = classify_trailer_type(video.get("type", ""), video.get("name", ""))

            await db.execute(
                """INSERT OR IGNORE INTO trailers
                   (movie_id, youtube_id, title, trailer_type, language, region,
                    is_official, quality, published_at, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tmdb')""",
                (
                    movie_id,
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


async def create_jobs(db, tracker: JobTracker):
    """Create Phase 2a jobs for all movies with a tmdb_id."""
    cursor = await db.execute(
        "SELECT imdb_id FROM movies WHERE tmdb_id IS NOT NULL ORDER BY priority_rank"
    )
    rows = await cursor.fetchall()
    imdb_ids = [r["imdb_id"] for r in rows]
    await tracker.create_jobs("videos_en", imdb_ids)
    logger.info(f"Created {len(imdb_ids):,} Phase 2a jobs")


async def run():
    """Execute Phase 2a: English Video Collection."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 2a: English Video Collection ===")

    db = await get_connection()
    tracker = JobTracker(db)

    # Create jobs if they don't exist
    progress = await tracker.get_progress("videos_en")
    if progress["total"] == 0:
        await create_jobs(db, tracker)
        progress = await tracker.get_progress("videos_en")

    logger.info(f"Total: {progress['total']:,} | Done: {progress['done']:,} | Remaining: {progress['remaining']:,}")

    if progress["remaining"] == 0:
        logger.info("No pending jobs. Phase 2a complete.")
        await db.close()
        return

    tracker.start_timer(progress["remaining"])

    sem = asyncio.Semaphore(CONCURRENT)

    async with aiohttp.ClientSession() as session:
        while True:
            jobs = await tracker.get_pending("videos_en", limit=BATCH_SIZE)
            if not jobs:
                break

            async def do_one(job):
                async with sem:
                    await process_movie(session, db, limiter, tracker, job)

            limiter = RateLimiter(TMDB_RATE_LIMIT)
            await asyncio.gather(*[do_one(j) for j in jobs])
            await db.commit()
            logger.info(f"Progress: {tracker.progress_line()}")

    # Summary
    cursor = await db.execute("SELECT COUNT(*) FROM trailers")
    total_trailers = (await cursor.fetchone())[0]
    logger.info(f"=== Phase 2a complete: {total_trailers:,} total trailers in database ===")

    await db.close()
