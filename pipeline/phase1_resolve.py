"""Phase 1: Resolve IMDb IDs to TMDB IDs via the TMDB Find API."""

import asyncio
import logging

import aiohttp

from pipeline.config import TMDB_API_KEY, TMDB_BASE_URL, TMDB_RATE_LIMIT
from pipeline.db import get_connection
from pipeline.rate_limiter import RateLimiter
from pipeline.job_tracker import JobTracker

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
CONCURRENT = 20


async def resolve_one(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    imdb_id: str,
) -> int | None:
    """Resolve a single IMDb ID to a TMDB ID. Returns tmdb_id or None."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/find/{imdb_id}"
    params = {"api_key": TMDB_API_KEY, "external_source": "imdb_id"}

    async with session.get(url, params=params) as resp:
        if resp.status == 429:
            limiter.on_429()
            raise Exception("Rate limited (429)")
        if resp.status != 200:
            raise Exception(f"HTTP {resp.status}")

        limiter.on_success()
        data = await resp.json()

        results = data.get("movie_results", [])
        if results:
            return results[0].get("id")
        return None


async def process_batch(
    session: aiohttp.ClientSession,
    db,
    limiter: RateLimiter,
    tracker: JobTracker,
    jobs: list[dict],
):
    """Process a batch of resolve jobs concurrently."""
    sem = asyncio.Semaphore(CONCURRENT)

    async def do_one(job):
        async with sem:
            job_id = job["id"]
            imdb_id = job["imdb_id"]
            await tracker.mark_in_progress(job_id)

            try:
                tmdb_id = await resolve_one(session, limiter, imdb_id)
                if tmdb_id is not None:
                    await db.execute(
                        "UPDATE movies SET tmdb_id = ?, updated_at = datetime('now') WHERE imdb_id = ?",
                        (tmdb_id, imdb_id),
                    )
                    await tracker.mark_complete(job_id)
                else:
                    await tracker.mark_skipped(job_id)
            except Exception as e:
                await tracker.mark_failed(job_id, str(e))
                if "429" in str(e):
                    await asyncio.sleep(2)

    await asyncio.gather(*[do_one(job) for job in jobs])
    await db.commit()


async def run():
    """Execute Phase 1: TMDB ID Resolution."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 1: TMDB ID Resolution ===")

    db = await get_connection()
    tracker = JobTracker(db)
    limiter = RateLimiter(TMDB_RATE_LIMIT)

    # Get total pending
    progress = await tracker.get_progress("resolve")
    logger.info(f"Total: {progress['total']:,} | Done: {progress['done']:,} | Remaining: {progress['remaining']:,}")

    if progress["remaining"] == 0:
        logger.info("No pending jobs. Phase 1 complete.")
        await db.close()
        return

    tracker.start_timer(progress["remaining"])

    async with aiohttp.ClientSession() as session:
        while True:
            jobs = await tracker.get_pending("resolve", limit=BATCH_SIZE)
            if not jobs:
                break

            await process_batch(session, db, limiter, tracker, jobs)
            logger.info(f"Progress: {tracker.progress_line()}")

    # Summary
    progress = await tracker.get_progress("resolve")
    cursor = await db.execute("SELECT COUNT(*) FROM movies WHERE tmdb_id IS NOT NULL")
    resolved = (await cursor.fetchone())[0]
    logger.info(f"=== Phase 1 complete: {resolved:,} movies resolved | {progress['failed']} failed ===")

    await db.close()
