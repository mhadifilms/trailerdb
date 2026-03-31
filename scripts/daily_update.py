"""Daily update script for TrailerDB.

Downloads the latest TMDB daily exports, finds new movies and series,
fetches their trailers, and checks popular existing movies for new trailers.

Usage:
    python scripts/daily_update.py
"""

import asyncio
import gzip
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp

from pipeline.config import (
    DATA_DIR,
    DB_PATH,
    TIER1_LANGUAGES,
    TMDB_API_KEY,
    TMDB_BASE_URL,
    TMDB_EXPORT_URL,
    TMDB_RATE_LIMIT,
)
from pipeline.db import get_connection, init_db_sync
from pipeline.rate_limiter import RateLimiter
from pipeline.type_classifier import classify_trailer_type

logger = logging.getLogger(__name__)

CONCURRENT = 20
TOP_MOVIES_TO_CHECK = 1000


# ---------------------------------------------------------------------------
# TMDB daily export download helpers
# ---------------------------------------------------------------------------

async def download_export(session: aiohttp.ClientSession, prefix: str) -> Path | None:
    """Download a TMDB daily export file (tries today, then yesterday).

    Args:
        session: An active aiohttp session.
        prefix: The file prefix, e.g. 'movie_ids' or 'tv_series_ids'.

    Returns:
        Path to the downloaded gzip file, or None on failure.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for offset in (0, 1):
        date_str = (datetime.now() - timedelta(days=offset)).strftime("%m_%d_%Y")
        filename = f"{prefix}_{date_str}.json.gz"
        url = f"{TMDB_EXPORT_URL}/{filename}"
        dest = DATA_DIR / filename

        if dest.exists():
            logger.info(f"Export already downloaded: {dest}")
            return dest

        logger.info(f"Downloading {url} ...")
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.read()
                dest.write_bytes(data)
                logger.info(f"Downloaded {dest.name} ({len(data):,} bytes)")
                return dest
            logger.warning(f"HTTP {resp.status} for {url}")

    logger.error(f"Could not download TMDB export for prefix '{prefix}'")
    return None


def parse_export_ids(export_path: Path) -> set[int]:
    """Parse a gzipped TMDB daily export and return the set of TMDB IDs."""
    ids: set[int] = set()
    with gzip.open(export_path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                tmdb_id = entry.get("id")
                adult = entry.get("adult", False)
                if tmdb_id and not adult:
                    ids.add(int(tmdb_id))
            except (json.JSONDecodeError, ValueError):
                continue
    return ids


# ---------------------------------------------------------------------------
# TMDB API fetch helpers
# ---------------------------------------------------------------------------

async def fetch_movie_details(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
    language: str = "en-US",
    append_videos: bool = True,
) -> dict | None:
    """Fetch movie details (optionally with videos) from TMDB."""
    await limiter.acquire()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
    params = {"api_key": TMDB_API_KEY, "language": language}
    if append_videos:
        params["append_to_response"] = "videos"

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


async def fetch_movie_videos_for_language(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
    language: str,
) -> list[dict]:
    """Fetch videos for a specific movie in a given language."""
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


async def fetch_series_details(
    session: aiohttp.ClientSession,
    limiter: RateLimiter,
    tmdb_id: int,
) -> dict | None:
    """Fetch TV series details + videos from TMDB."""
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


# ---------------------------------------------------------------------------
# Database helper: store videos as trailers
# ---------------------------------------------------------------------------

def store_movie_videos(conn: sqlite3.Connection, movie_id: int, videos: list[dict]) -> int:
    """Insert YouTube videos into the trailers table. Returns count of new rows."""
    count = 0
    for video in videos:
        if video.get("site") != "YouTube":
            continue
        trailer_type = classify_trailer_type(video.get("type", ""), video.get("name", ""))
        try:
            conn.execute(
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
            if conn.total_changes:  # rowcount proxy — INSERT OR IGNORE sets changes on insert
                count += 1
        except sqlite3.IntegrityError:
            pass
    return count


def store_series_videos(conn: sqlite3.Connection, series_id: int, videos: list[dict]) -> int:
    """Insert YouTube videos into the series_trailers table. Returns count of new rows."""
    count = 0
    for video in videos:
        if video.get("site") != "YouTube":
            continue
        trailer_type = classify_trailer_type(video.get("type", ""), video.get("name", ""))
        try:
            conn.execute(
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
            if conn.total_changes:
                count += 1
        except sqlite3.IntegrityError:
            pass
    return count


# ---------------------------------------------------------------------------
# Core routines
# ---------------------------------------------------------------------------

async def process_new_movies(
    session: aiohttp.ClientSession,
    conn: sqlite3.Connection,
    limiter: RateLimiter,
    new_tmdb_ids: list[int],
) -> tuple[int, int]:
    """Fetch details + trailers for new movies. Returns (movies_added, trailers_added)."""
    movies_added = 0
    trailers_added = 0
    sem = asyncio.Semaphore(CONCURRENT)

    async def process_one(tmdb_id: int):
        nonlocal movies_added, trailers_added
        async with sem:
            try:
                data = await fetch_movie_details(session, limiter, tmdb_id)
            except Exception as e:
                logger.debug(f"Failed to fetch movie {tmdb_id}: {e}")
                if "429" in str(e):
                    await asyncio.sleep(2)
                return

            if data is None:
                return

            imdb_id = data.get("imdb_id")
            if not imdb_id:
                return

            title = data.get("title", "Unknown")
            release_date = data.get("release_date")
            year = None
            if release_date and len(release_date) >= 4:
                try:
                    year = int(release_date[:4])
                except ValueError:
                    pass

            # Insert movie
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO movies
                       (imdb_id, tmdb_id, title, original_title, year, tmdb_popularity,
                        poster_path, backdrop_path, overview, runtime,
                        original_language, release_date)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        imdb_id,
                        tmdb_id,
                        title,
                        data.get("original_title"),
                        year,
                        data.get("popularity"),
                        data.get("poster_path"),
                        data.get("backdrop_path"),
                        data.get("overview"),
                        data.get("runtime"),
                        data.get("original_language"),
                        release_date,
                    ),
                )
            except sqlite3.IntegrityError:
                return  # already exists

            cursor = conn.execute("SELECT id FROM movies WHERE imdb_id = ?", (imdb_id,))
            row = cursor.fetchone()
            if row is None:
                return
            movie_id = row[0]
            movies_added += 1

            # Store genres
            for genre in data.get("genres", []):
                conn.execute(
                    "INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)",
                    (genre["id"], genre["name"]),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)",
                    (movie_id, genre["id"]),
                )

            # English trailers (from append_to_response)
            en_videos = data.get("videos", {}).get("results", [])
            trailers_added += store_movie_videos(conn, movie_id, en_videos)

            # Tier 1 multilingual trailers
            for lang in TIER1_LANGUAGES:
                try:
                    lang_videos = await fetch_movie_videos_for_language(session, limiter, tmdb_id, lang)
                    trailers_added += store_movie_videos(conn, movie_id, lang_videos)
                except Exception as e:
                    logger.debug(f"Failed to fetch {lang} videos for movie {tmdb_id}: {e}")
                    if "429" in str(e):
                        await asyncio.sleep(2)

    # Process in batches to keep commits manageable
    batch_size = 100
    for i in range(0, len(new_tmdb_ids), batch_size):
        batch = new_tmdb_ids[i : i + batch_size]
        await asyncio.gather(*[process_one(tid) for tid in batch])
        conn.commit()
        logger.info(f"  Movies batch {i + len(batch)}/{len(new_tmdb_ids)} — "
                     f"{movies_added} added, {trailers_added} trailers so far")

    return movies_added, trailers_added


async def check_popular_movies_for_new_trailers(
    session: aiohttp.ClientSession,
    conn: sqlite3.Connection,
    limiter: RateLimiter,
) -> int:
    """Re-check the top N most popular movies for new trailers. Returns trailers added."""
    cursor = conn.execute(
        """SELECT id, tmdb_id FROM movies
           WHERE tmdb_id IS NOT NULL
           ORDER BY tmdb_popularity DESC NULLS LAST
           LIMIT ?""",
        (TOP_MOVIES_TO_CHECK,),
    )
    rows = cursor.fetchall()
    if not rows:
        return 0

    logger.info(f"Checking {len(rows)} popular movies for new trailers...")
    trailers_added = 0
    sem = asyncio.Semaphore(CONCURRENT)

    async def check_one(movie_id: int, tmdb_id: int):
        nonlocal trailers_added
        async with sem:
            try:
                data = await fetch_movie_details(session, limiter, tmdb_id)
            except Exception as e:
                logger.debug(f"Failed to fetch movie {tmdb_id}: {e}")
                if "429" in str(e):
                    await asyncio.sleep(2)
                return

            if data is None:
                return

            videos = data.get("videos", {}).get("results", [])
            trailers_added += store_movie_videos(conn, movie_id, videos)

    batch_size = 200
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        await asyncio.gather(*[check_one(mid, tid) for mid, tid in batch])
        conn.commit()
        if (i + len(batch)) % 500 == 0 or i + len(batch) == len(rows):
            logger.info(f"  Popular movies checked: {i + len(batch)}/{len(rows)} — "
                         f"{trailers_added} new trailers found")

    return trailers_added


async def process_new_series(
    session: aiohttp.ClientSession,
    conn: sqlite3.Connection,
    limiter: RateLimiter,
    new_tmdb_ids: list[int],
) -> tuple[int, int]:
    """Fetch details + trailers for new TV series. Returns (series_added, trailers_added)."""
    series_added = 0
    trailers_added = 0
    sem = asyncio.Semaphore(CONCURRENT)

    async def process_one(tmdb_id: int):
        nonlocal series_added, trailers_added
        async with sem:
            try:
                data = await fetch_series_details(session, limiter, tmdb_id)
            except Exception as e:
                logger.debug(f"Failed to fetch series {tmdb_id}: {e}")
                if "429" in str(e):
                    await asyncio.sleep(2)
                return

            if data is None:
                return

            name = data.get("name") or data.get("original_name") or f"Unknown Series {tmdb_id}"

            # Insert series
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO series
                       (tmdb_id, name, original_name, first_air_date, overview,
                        poster_path, backdrop_path, status, number_of_seasons,
                        vote_average, vote_count, popularity, original_language)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        tmdb_id,
                        name,
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
                    ),
                )
            except sqlite3.IntegrityError:
                return  # already exists

            cursor = conn.execute("SELECT id FROM series WHERE tmdb_id = ?", (tmdb_id,))
            row = cursor.fetchone()
            if row is None:
                return
            series_id = row[0]
            series_added += 1

            # Store genres
            for genre in data.get("genres", []):
                conn.execute(
                    "INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)",
                    (genre["id"], genre["name"]),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO series_genres (series_id, genre_id) VALUES (?, ?)",
                    (series_id, genre["id"]),
                )

            # Store trailers
            videos = data.get("videos", {}).get("results", [])
            trailers_added += store_series_videos(conn, series_id, videos)

    batch_size = 100
    for i in range(0, len(new_tmdb_ids), batch_size):
        batch = new_tmdb_ids[i : i + batch_size]
        await asyncio.gather(*[process_one(tid) for tid in batch])
        conn.commit()
        logger.info(f"  Series batch {i + len(batch)}/{len(new_tmdb_ids)} — "
                     f"{series_added} added, {trailers_added} trailers so far")

    return series_added, trailers_added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run():
    """Execute the daily update."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    if not TMDB_API_KEY:
        logger.error("TMDB_API_KEY is not set. Aborting.")
        return

    logger.info("=== TrailerDB Daily Update ===")

    # Ensure database exists with latest schema
    init_db_sync()

    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    limiter = RateLimiter(TMDB_RATE_LIMIT)

    async with aiohttp.ClientSession() as session:

        # ---------------------------------------------------------------
        # 1. New movies
        # ---------------------------------------------------------------
        logger.info("--- Step 1: Check for new movies ---")
        movie_export = await download_export(session, "movie_ids")
        new_movie_count = 0
        new_movie_trailers = 0

        if movie_export:
            export_ids = parse_export_ids(movie_export)
            logger.info(f"TMDB movie export contains {len(export_ids):,} entries")

            # Get existing TMDB IDs from our DB
            cursor = conn.execute("SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL")
            existing_ids = {row[0] for row in cursor.fetchall()}
            logger.info(f"Existing movies in DB: {len(existing_ids):,}")

            new_ids = sorted(export_ids - existing_ids)
            logger.info(f"New movie IDs to process: {len(new_ids):,}")

            if new_ids:
                # Limit to a reasonable daily batch: the most recent IDs
                # (TMDB IDs are sequential, higher = newer)
                if len(new_ids) > 5000:
                    logger.info(f"Limiting to 5,000 newest movies (out of {len(new_ids):,})")
                    new_ids = new_ids[-5000:]

                new_movie_count, new_movie_trailers = await process_new_movies(
                    session, conn, limiter, new_ids
                )
        else:
            logger.warning("Skipping new movie check (export download failed)")

        # ---------------------------------------------------------------
        # 2. Check popular movies for new trailers
        # ---------------------------------------------------------------
        logger.info("--- Step 2: Check popular movies for new trailers ---")
        popular_trailers = await check_popular_movies_for_new_trailers(
            session, conn, limiter
        )

        # ---------------------------------------------------------------
        # 3. New TV series
        # ---------------------------------------------------------------
        logger.info("--- Step 3: Check for new TV series ---")
        series_export = await download_export(session, "tv_series_ids")
        new_series_count = 0
        new_series_trailers = 0

        if series_export:
            export_ids = parse_export_ids(series_export)
            logger.info(f"TMDB series export contains {len(export_ids):,} entries")

            cursor = conn.execute("SELECT tmdb_id FROM series WHERE tmdb_id IS NOT NULL")
            existing_ids = {row[0] for row in cursor.fetchall()}
            logger.info(f"Existing series in DB: {len(existing_ids):,}")

            new_ids = sorted(export_ids - existing_ids)
            logger.info(f"New series IDs to process: {len(new_ids):,}")

            if new_ids:
                if len(new_ids) > 5000:
                    logger.info(f"Limiting to 5,000 newest series (out of {len(new_ids):,})")
                    new_ids = new_ids[-5000:]

                new_series_count, new_series_trailers = await process_new_series(
                    session, conn, limiter, new_ids
                )
        else:
            logger.warning("Skipping new series check (export download failed)")

    conn.commit()
    conn.close()

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    total_trailers = new_movie_trailers + popular_trailers + new_series_trailers
    logger.info("=== Daily Update Summary ===")
    logger.info(f"  New movies added:            {new_movie_count:,}")
    logger.info(f"  Trailers from new movies:    {new_movie_trailers:,}")
    logger.info(f"  Trailers from popular check: {popular_trailers:,}")
    logger.info(f"  New series added:            {new_series_count:,}")
    logger.info(f"  Trailers from new series:    {new_series_trailers:,}")
    logger.info(f"  Total new trailers:          {total_trailers:,}")
    logger.info("=== Done ===")


if __name__ == "__main__":
    asyncio.run(run())
