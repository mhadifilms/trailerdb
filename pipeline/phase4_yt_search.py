"""Phase 4: YouTube Search gap-fill for movies with zero trailers."""

import asyncio
import logging
import re

import aiohttp

from pipeline.config import YOUTUBE_API_KEY, YOUTUBE_BASE_URL
from pipeline.db import get_connection
from pipeline.job_tracker import JobTracker

logger = logging.getLogger(__name__)

DAILY_SEARCH_LIMIT = 100  # 10,000 quota / 100 per search = 100 searches/day
MIN_DURATION = 30
MAX_DURATION = 300  # 5 minutes


def validate_result(video: dict, movie_title: str, movie_year: int | None) -> bool:
    """Heuristic validation of YouTube search results."""
    title = (video.get("snippet", {}).get("title") or "").lower()
    movie_lower = movie_title.lower()

    # Title should contain some part of the movie name
    # Use the longest word from the movie title as a proxy
    words = [w for w in movie_lower.split() if len(w) > 3]
    if words and not any(w in title for w in words):
        return False

    # Should look like a trailer
    trailer_keywords = ["trailer", "teaser", "official", "promo", "spot"]
    if not any(kw in title for kw in trailer_keywords):
        return False

    # Reject obvious non-trailers
    reject_keywords = ["reaction", "review", "breakdown", "explained", "fan made", "parody", "honest trailer"]
    if any(kw in title for kw in reject_keywords):
        return False

    return True


async def search_youtube(
    session: aiohttp.ClientSession,
    query: str,
    max_results: int = 5,
) -> list[dict]:
    """Search YouTube for trailers. Costs 100 quota units per call."""
    url = f"{YOUTUBE_BASE_URL}/search"
    params = {
        "key": YOUTUBE_API_KEY,
        "q": query,
        "type": "video",
        "maxResults": max_results,
        "part": "snippet",
        "videoDuration": "short",  # Under 4 minutes
    }

    async with session.get(url, params=params) as resp:
        if resp.status == 403:
            raise Exception("YouTube API quota exceeded")
        if resp.status != 200:
            raise Exception(f"YouTube API HTTP {resp.status}")

        data = await resp.json()
        return data.get("items", [])


async def run():
    """Execute Phase 4: YouTube Search Gap-Fill."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 4: YouTube Search Gap-Fill ===")

    if not YOUTUBE_API_KEY:
        logger.error("YOUTUBE_API_KEY not set. Skipping Phase 4.")
        return

    db = await get_connection()
    tracker = JobTracker(db)

    # Find movies with zero trailers, ordered by priority
    cursor = await db.execute(
        """SELECT m.id, m.imdb_id, m.title, m.year, m.priority_rank
           FROM movies m
           LEFT JOIN trailers t ON t.movie_id = m.id
           WHERE t.id IS NULL AND m.tmdb_id IS NOT NULL
           ORDER BY m.priority_rank ASC
           LIMIT ?""",
        (DAILY_SEARCH_LIMIT,),
    )
    movies = [dict(r) for r in await cursor.fetchall()]

    logger.info(f"Found {len(movies)} movies with zero trailers to search")

    if not movies:
        logger.info("All movies have trailers. Phase 4 complete.")
        await db.close()
        return

    searches_done = 0
    trailers_found = 0

    async with aiohttp.ClientSession() as session:
        for movie in movies:
            if searches_done >= DAILY_SEARCH_LIMIT:
                logger.warning("Daily search limit reached. Resume tomorrow.")
                break

            query = f'"{movie["title"]}" {movie["year"] or ""} official trailer'

            try:
                results = await search_youtube(session, query)
                searches_done += 1

                for result in results:
                    youtube_id = result.get("id", {}).get("videoId")
                    if not youtube_id:
                        continue

                    if not validate_result(result, movie["title"], movie["year"]):
                        continue

                    snippet = result.get("snippet", {})
                    await db.execute(
                        """INSERT OR IGNORE INTO trailers
                           (movie_id, youtube_id, title, trailer_type, language,
                            is_official, source, channel_name)
                           VALUES (?, ?, ?, 'trailer', 'en', 0, 'youtube_search', ?)""",
                        (
                            movie["id"],
                            youtube_id,
                            snippet.get("title"),
                            snippet.get("channelTitle"),
                        ),
                    )
                    trailers_found += 1

                if searches_done % 10 == 0:
                    await db.commit()
                    logger.info(f"Searched: {searches_done}/{len(movies)} | Found: {trailers_found} trailers")

                # Small delay between searches to be respectful
                await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Search failed for '{movie['title']}': {e}")
                if "quota" in str(e).lower():
                    break

    await db.commit()
    logger.info(f"=== Phase 4 complete: {searches_done} searches, {trailers_found} trailers found ===")
    await db.close()
