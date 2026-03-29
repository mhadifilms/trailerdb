"""Compute derived analytics data for TrailerDB.

1a. Trailer Timeline — fetch release_date from TMDB, compute days_before_release
1b. Confidence Score — score each trailer-movie pair (0-100)
1c. Channel Intelligence — aggregate channel stats to JSON
"""

import asyncio
import json
import logging
import sqlite3
import statistics
from pathlib import Path

import aiohttp

from pipeline.config import TMDB_API_KEY, TMDB_BASE_URL, TMDB_RATE_LIMIT
from pipeline.db import get_connection
from pipeline.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "site" / "public" / "data"

BATCH_SIZE = 500
CONCURRENT = 20

# Known studio keywords for channel matching
STUDIO_KEYWORDS = [
    "warner", "sony", "universal", "disney", "paramount",
    "fox", "lionsgate", "mgm", "a24", "netflix", "amazon", "apple",
]


# ---------------------------------------------------------------------------
# 1a. Trailer Timeline
# ---------------------------------------------------------------------------

async def fetch_release_date(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
) -> str | None:
    """Fetch release_date for a single movie from TMDB."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
    params = {"api_key": TMDB_API_KEY}

    try:
        async with session.get(url, params=params) as resp:
            if resp.status == 429:
                limiter.on_429()
                raise Exception("Rate limited (429)")
            if resp.status != 200:
                raise Exception(f"HTTP {resp.status}")

            limiter.on_success()
            data = await resp.json()
            return data.get("release_date") or None
    except Exception as e:
        if "429" not in str(e):
            logger.debug(f"Failed to fetch TMDB {tmdb_id}: {e}")
        raise


async def compute_timeline(db):
    """Fetch release dates from TMDB and compute days_before_release."""
    logger.info("=== 1a. Trailer Timeline ===")

    # Find movies that have trailers + tmdb_id but no release_date yet
    cursor = await db.execute("""
        SELECT m.id, m.tmdb_id
        FROM movies m
        WHERE m.tmdb_id IS NOT NULL
          AND m.release_date IS NULL
          AND m.id IN (SELECT DISTINCT movie_id FROM trailers)
    """)
    movies = await cursor.fetchall()
    total = len(movies)

    if total == 0:
        logger.info("No movies need release_date lookup. Skipping.")
    else:
        logger.info(f"Fetching release dates for {total:,} movies...")
        limiter = RateLimiter(TMDB_RATE_LIMIT)
        sem = asyncio.Semaphore(CONCURRENT)
        fetched = 0
        failed = 0

        async with aiohttp.ClientSession() as session:
            async def do_one(movie_id: int, tmdb_id: int):
                nonlocal fetched, failed
                async with sem:
                    for attempt in range(3):
                        try:
                            release_date = await fetch_release_date(session, limiter, tmdb_id)
                            if release_date:
                                await db.execute(
                                    "UPDATE movies SET release_date = ?, updated_at = datetime('now') WHERE id = ?",
                                    (release_date, movie_id),
                                )
                            fetched += 1
                            return
                        except Exception as e:
                            if "429" in str(e):
                                await asyncio.sleep(2 ** (attempt + 1))
                            elif attempt == 2:
                                failed += 1
                                logger.debug(f"Failed TMDB {tmdb_id} after 3 attempts: {e}")

            # Process in batches to commit periodically
            for i in range(0, total, BATCH_SIZE):
                batch = movies[i:i + BATCH_SIZE]
                await asyncio.gather(*[do_one(m["id"], m["tmdb_id"]) for m in batch])
                await db.commit()
                logger.info(f"  Timeline: {min(i + BATCH_SIZE, total):,}/{total:,} processed ({failed} failed)")

        logger.info(f"  Fetched {fetched:,} release dates ({failed} failed)")

    # Compute days_before_release for all trailers that have the data
    logger.info("Computing days_before_release...")
    await db.execute("""
        UPDATE trailers
        SET days_before_release = CAST(
            julianday(
                (SELECT m.release_date FROM movies m WHERE m.id = trailers.movie_id)
            ) - julianday(trailers.published_at) AS INTEGER
        )
        WHERE published_at IS NOT NULL
          AND (SELECT m.release_date FROM movies m WHERE m.id = trailers.movie_id) IS NOT NULL
    """)
    await db.commit()

    cursor = await db.execute(
        "SELECT COUNT(*) FROM trailers WHERE days_before_release IS NOT NULL"
    )
    count = (await cursor.fetchone())[0]
    logger.info(f"  Computed days_before_release for {count:,} trailers")


# ---------------------------------------------------------------------------
# 1b. Confidence Score
# ---------------------------------------------------------------------------

async def compute_confidence(db):
    """Score each trailer-movie pair on a 0-100 confidence scale."""
    logger.info("=== 1b. Confidence Score ===")

    # Fetch all trailers with related movie info
    cursor = await db.execute("""
        SELECT t.id, t.source, t.is_official, t.title, t.published_at,
               t.view_count, t.channel_name,
               m.title AS movie_title, m.year
        FROM trailers t
        JOIN movies m ON m.id = t.movie_id
    """)
    rows = await cursor.fetchall()
    logger.info(f"Scoring {len(rows):,} trailers...")

    updates = []
    for row in rows:
        score = 0

        # source
        source = row["source"] or ""
        if source == "tmdb":
            score += 40
        elif source == "youtube_search":
            score += 10

        # is_official
        if row["is_official"]:
            score += 20

        # title match
        trailer_title = (row["title"] or "").lower()
        movie_title = (row["movie_title"] or "").lower()
        if movie_title and movie_title in trailer_title:
            score += 15

        # published_at within 3 years of movie year
        published_at = row["published_at"] or ""
        movie_year = row["year"]
        if published_at and movie_year:
            try:
                pub_year = int(published_at[:4])
                if abs(pub_year - movie_year) <= 3:
                    score += 10
            except (ValueError, IndexError):
                pass

        # view_count
        view_count = row["view_count"]
        if view_count is not None and view_count > 10000:
            score += 5

        # channel contains studio keyword
        channel = (row["channel_name"] or "").lower()
        if any(kw in channel for kw in STUDIO_KEYWORDS):
            score += 10

        updates.append((min(score, 100), row["id"]))

    # Batch update
    for i in range(0, len(updates), 5000):
        batch = updates[i:i + 5000]
        await db.executemany(
            "UPDATE trailers SET confidence = ? WHERE id = ?",
            batch,
        )
        await db.commit()

    logger.info(f"  Scored {len(updates):,} trailers")

    # Show distribution
    cursor = await db.execute("""
        SELECT
            CASE
                WHEN confidence >= 80 THEN 'high (80-100)'
                WHEN confidence >= 50 THEN 'medium (50-79)'
                WHEN confidence >= 20 THEN 'low (20-49)'
                ELSE 'very low (0-19)'
            END AS band,
            COUNT(*) as cnt
        FROM trailers
        WHERE confidence IS NOT NULL
        GROUP BY band
        ORDER BY band
    """)
    for row in await cursor.fetchall():
        logger.info(f"    {row['band']}: {row['cnt']:,}")


# ---------------------------------------------------------------------------
# 1c. Channel Intelligence
# ---------------------------------------------------------------------------

async def compute_channels(db):
    """Generate channel aggregation JSON."""
    logger.info("=== 1c. Channel Intelligence ===")

    cursor = await db.execute("""
        SELECT t.channel_id, t.channel_name,
               COUNT(*) AS trailer_count,
               COUNT(DISTINCT t.movie_id) AS movie_count
        FROM trailers t
        WHERE t.channel_id IS NOT NULL AND t.channel_name IS NOT NULL
        GROUP BY t.channel_id
        HAVING COUNT(*) >= 5
        ORDER BY trailer_count DESC
    """)
    channels_raw = await cursor.fetchall()

    channels = []
    for ch in channels_raw:
        # Get top 3 movies by vote count for this channel
        top_cursor = await db.execute("""
            SELECT m.imdb_id
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.channel_id = ?
            GROUP BY m.imdb_id
            ORDER BY m.imdb_votes DESC
            LIMIT 3
        """, (ch["channel_id"],))
        top_movies = [row["imdb_id"] for row in await top_cursor.fetchall()]

        channels.append({
            "channel_id": ch["channel_id"],
            "channel_name": ch["channel_name"],
            "trailer_count": ch["trailer_count"],
            "movie_count": ch["movie_count"],
            "top_movies": top_movies,
        })

    # Write output
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)
    output_path = browse_dir / "channels.json"
    output_path.write_text(json.dumps(channels, separators=(",", ":")), encoding="utf-8")

    logger.info(f"  {len(channels):,} channels with 5+ trailers → {output_path}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run():
    """Execute all analytics computations."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    logger.info("=== TrailerDB Analytics ===")

    db = await get_connection()

    # Ensure columns exist (migrations)
    for migration in [
        "ALTER TABLE movies ADD COLUMN release_date TEXT",
        "ALTER TABLE trailers ADD COLUMN days_before_release INTEGER",
        "ALTER TABLE trailers ADD COLUMN confidence INTEGER",
    ]:
        try:
            await db.execute(migration)
            await db.commit()
        except Exception:
            pass  # Column already exists

    await compute_timeline(db)
    await compute_confidence(db)
    await compute_channels(db)

    await db.close()
    logger.info("=== Analytics complete ===")


if __name__ == "__main__":
    asyncio.run(run())
