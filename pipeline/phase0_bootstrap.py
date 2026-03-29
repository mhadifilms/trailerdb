"""Phase 0: Bootstrap — Parse TSV, load movies, cross-ref TMDB daily export."""

import csv
import gzip
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

import aiohttp

from pipeline.config import DATA_DIR, DB_PATH, MOVIES_TSV, TMDB_EXPORT_URL
from pipeline.db import init_db_sync

logger = logging.getLogger(__name__)


def parse_tsv(path: Path) -> list[dict]:
    """Parse the movies TSV file into a list of dicts."""
    movies = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for rank, row in enumerate(reader, start=1):
            movies.append({
                "imdb_id": row["imdb_id"],
                "title": row["title"],
                "year": int(row["year"]) if row.get("year") else None,
                "imdb_rating": float(row["rating"]) if row.get("rating") else None,
                "imdb_votes": int(row["votes"]) if row.get("votes") else None,
                "priority_rank": rank,
            })
    return movies


def load_movies(conn: sqlite3.Connection, movies: list[dict]):
    """Bulk insert movies into the database."""
    conn.executemany(
        """INSERT OR IGNORE INTO movies (imdb_id, title, year, imdb_rating, imdb_votes, priority_rank)
           VALUES (:imdb_id, :title, :year, :imdb_rating, :imdb_votes, :priority_rank)""",
        movies,
    )
    conn.commit()
    logger.info(f"Loaded {len(movies):,} movies into database")


async def download_tmdb_export() -> Path:
    """Download today's TMDB daily movie ID export."""
    today = datetime.now().strftime("%m_%d_%Y")
    filename = f"movie_ids_{today}.json.gz"
    url = f"{TMDB_EXPORT_URL}/{filename}"
    dest = DATA_DIR / filename

    if dest.exists():
        logger.info(f"TMDB export already downloaded: {dest}")
        return dest

    logger.info(f"Downloading TMDB daily export: {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                logger.warning(f"Failed to download TMDB export (HTTP {resp.status}), trying yesterday")
                # Try yesterday's export
                from datetime import timedelta
                yesterday = (datetime.now() - timedelta(days=1)).strftime("%m_%d_%Y")
                filename = f"movie_ids_{yesterday}.json.gz"
                url = f"{TMDB_EXPORT_URL}/{filename}"
                dest = DATA_DIR / filename
                if dest.exists():
                    return dest
                async with session.get(url) as resp2:
                    if resp2.status != 200:
                        logger.error(f"Failed to download TMDB export for yesterday too")
                        return None
                    data = await resp2.read()
            else:
                data = await resp.read()

    dest.write_bytes(data)
    logger.info(f"Downloaded TMDB export: {dest} ({len(data):,} bytes)")
    return dest


def cross_reference_tmdb_export(conn: sqlite3.Connection, export_path: Path) -> int:
    """Cross-reference TMDB export to pre-populate tmdb_id on movies."""
    if export_path is None:
        logger.warning("No TMDB export available, skipping cross-reference")
        return 0

    # Build a map of imdb_id -> tmdb_id from the export
    imdb_to_tmdb = {}
    with gzip.open(export_path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                # The export may or may not have imdb_id directly
                # It has: id, original_title, popularity, video, adult
                tmdb_id = entry.get("id")
                if tmdb_id:
                    imdb_to_tmdb[tmdb_id] = tmdb_id
            except json.JSONDecodeError:
                continue

    # The daily export doesn't contain imdb_ids directly.
    # It contains tmdb_id, original_title, popularity, adult.
    # We can still use it to know which TMDB IDs exist, but can't map
    # to imdb_id without API calls. However, we store the export for
    # future use and skip cross-referencing for now.
    logger.info(f"TMDB export contains {len(imdb_to_tmdb):,} movie entries")
    logger.info("Note: TMDB daily export doesn't contain IMDb IDs — Phase 1 will resolve them via API")
    return 0


def create_phase1_jobs(conn: sqlite3.Connection):
    """Create ingestion_log entries for Phase 1 (TMDB ID resolution)."""
    cursor = conn.execute(
        "SELECT imdb_id FROM movies WHERE tmdb_id IS NULL ORDER BY priority_rank"
    )
    imdb_ids = [row[0] for row in cursor.fetchall()]

    conn.executemany(
        "INSERT OR IGNORE INTO ingestion_log (phase, imdb_id, status) VALUES ('resolve', ?, 'pending')",
        [(imdb_id,) for imdb_id in imdb_ids],
    )
    conn.commit()
    logger.info(f"Created {len(imdb_ids):,} Phase 1 jobs")


async def run():
    """Execute Phase 0: Bootstrap."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    logger.info("=== Phase 0: Bootstrap ===")

    # 1. Initialize database
    init_db_sync()
    logger.info(f"Database initialized at {DB_PATH}")

    # 2. Parse and load movies
    logger.info(f"Parsing {MOVIES_TSV}")
    movies = parse_tsv(MOVIES_TSV)
    logger.info(f"Parsed {len(movies):,} movies")

    conn = sqlite3.connect(DB_PATH)
    load_movies(conn, movies)

    # 3. Download and cross-reference TMDB export
    export_path = await download_tmdb_export()
    matched = cross_reference_tmdb_export(conn, export_path)
    logger.info(f"Pre-resolved {matched:,} TMDB IDs from daily export")

    # 4. Create Phase 1 jobs
    create_phase1_jobs(conn)

    # Summary
    cursor = conn.execute("SELECT COUNT(*) FROM movies")
    total = cursor.fetchone()[0]
    cursor = conn.execute("SELECT COUNT(*) FROM movies WHERE tmdb_id IS NOT NULL")
    resolved = cursor.fetchone()[0]
    logger.info(f"=== Bootstrap complete: {total:,} movies, {resolved:,} with TMDB IDs ===")

    conn.close()
