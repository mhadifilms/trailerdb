"""Phase 2b: Collect multilingual trailers from TMDB using a tiered strategy."""

import asyncio
import logging

import aiohttp

from pipeline.config import (
    TMDB_API_KEY, TMDB_BASE_URL, TMDB_RATE_LIMIT,
    TIER1_LANGUAGES, TIER2_LANGUAGES, TIER3_LANGUAGES,
    TIER2_MAX_RANK, TIER3_MAX_RANK,
)
from pipeline.db import get_connection
from pipeline.rate_limiter import RateLimiter
from pipeline.job_tracker import JobTracker
from pipeline.type_classifier import classify_trailer_type

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
CONCURRENT = 20


async def fetch_videos_for_language(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
    language: str,
) -> list[dict]:
    """Fetch videos for a movie in a specific language."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}/videos"
    params = {"api_key": TMDB_API_KEY, "language": language}

    async with session.get(url, params=params) as resp:
        if resp.status == 429:
            limiter.on_429()
            raise Exception("Rate limited (429)")
        if resp.status == 404:
            return []
        if resp.status != 200:
            raise Exception(f"HTTP {resp.status}")

        limiter.on_success()
        data = await resp.json()
        return data.get("results", [])


async def process_job(
    session: aiohttp.ClientSession,
    db,
    limiter: RateLimiter,
    tracker: JobTracker,
    job: dict,
    language: str,
):
    """Process a single (movie, language) pair."""
    job_id = job["id"]
    imdb_id = job["imdb_id"]
    tmdb_id = job["tmdb_id"]

    if tmdb_id is None:
        await tracker.mark_skipped(job_id)
        return

    await tracker.mark_in_progress(job_id)

    try:
        videos = await fetch_videos_for_language(session, limiter, tmdb_id, language)

        # Get movie_id
        cursor = await db.execute("SELECT id FROM movies WHERE imdb_id = ?", (imdb_id,))
        row = await cursor.fetchone()
        if row is None:
            await tracker.mark_skipped(job_id)
            return
        movie_id = row["id"]

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

        await tracker.mark_complete(job_id)

    except Exception as e:
        await tracker.mark_failed(job_id, str(e))
        if "429" in str(e):
            await asyncio.sleep(2)


async def create_jobs_for_tier(db, tracker: JobTracker, languages: list[str], max_rank: int | None):
    """Create ingestion_log entries for a tier of languages."""
    if max_rank:
        cursor = await db.execute(
            "SELECT imdb_id FROM movies WHERE tmdb_id IS NOT NULL AND priority_rank <= ? ORDER BY priority_rank",
            (max_rank,),
        )
    else:
        cursor = await db.execute(
            "SELECT imdb_id FROM movies WHERE tmdb_id IS NOT NULL ORDER BY priority_rank"
        )
    rows = await cursor.fetchall()
    imdb_ids = [r["imdb_id"] for r in rows]

    for lang in languages:
        await tracker.create_jobs("videos_multi", imdb_ids, language=lang)
        logger.info(f"Created {len(imdb_ids):,} jobs for language '{lang}'")


async def run():
    """Execute Phase 2b: Multilingual Video Collection."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 2b: Multilingual Video Collection ===")

    db = await get_connection()
    tracker = JobTracker(db)

    # Create jobs for all tiers if they don't exist
    progress = await tracker.get_progress("videos_multi")
    if progress["total"] == 0:
        logger.info("Creating jobs for all tiers...")
        await create_jobs_for_tier(db, tracker, TIER1_LANGUAGES, max_rank=None)
        await create_jobs_for_tier(db, tracker, TIER2_LANGUAGES, max_rank=TIER2_MAX_RANK)
        await create_jobs_for_tier(db, tracker, TIER3_LANGUAGES, max_rank=TIER3_MAX_RANK)

    # Process each language
    all_languages = TIER1_LANGUAGES + TIER2_LANGUAGES + TIER3_LANGUAGES
    limiter = RateLimiter(TMDB_RATE_LIMIT)
    sem = asyncio.Semaphore(CONCURRENT)

    async with aiohttp.ClientSession() as session:
        for lang in all_languages:
            progress = await tracker.get_progress("videos_multi", language=lang)
            if progress["remaining"] == 0:
                logger.info(f"Language '{lang}': already complete ({progress['done']:,} done)")
                continue

            logger.info(f"Processing language '{lang}': {progress['remaining']:,} remaining")
            tracker.start_timer(progress["remaining"])

            while True:
                jobs = await tracker.get_pending("videos_multi", language=lang, limit=BATCH_SIZE)
                if not jobs:
                    break

                async def do_one(job, language=lang):
                    async with sem:
                        await process_job(session, db, limiter, tracker, job, language)

                await asyncio.gather(*[do_one(j) for j in jobs])
                await db.commit()
                logger.info(f"  [{lang}] {tracker.progress_line()}")

    # Summary
    cursor = await db.execute("SELECT COUNT(*) FROM trailers")
    total = (await cursor.fetchone())[0]
    cursor = await db.execute("SELECT COUNT(DISTINCT language) FROM trailers")
    lang_count = (await cursor.fetchone())[0]
    logger.info(f"=== Phase 2b complete: {total:,} total trailers in {lang_count} languages ===")

    await db.close()
