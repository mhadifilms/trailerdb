"""Phase 5: Series Bootstrap — Download TMDB daily TV series export, load series."""

import gzip
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

import aiohttp

from pipeline.config import DATA_DIR, DB_PATH, TMDB_EXPORT_URL
from pipeline.db import init_db_sync

logger = logging.getLogger(__name__)


async def download_tmdb_series_export() -> Path | None:
    """Download today's TMDB daily TV series ID export."""
    today = datetime.now().strftime("%m_%d_%Y")
    filename = f"tv_series_ids_{today}.json.gz"
    url = f"{TMDB_EXPORT_URL}/{filename}"
    dest = DATA_DIR / filename

    if dest.exists():
        logger.info(f"TMDB series export already downloaded: {dest}")
        return dest

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    logger.info(f"Downloading TMDB daily TV series export: {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                logger.warning(f"Failed to download TMDB series export (HTTP {resp.status}), trying yesterday")
                from datetime import timedelta
                yesterday = (datetime.now() - timedelta(days=1)).strftime("%m_%d_%Y")
                filename = f"tv_series_ids_{yesterday}.json.gz"
                url = f"{TMDB_EXPORT_URL}/{filename}"
                dest = DATA_DIR / filename
                if dest.exists():
                    return dest
                async with session.get(url) as resp2:
                    if resp2.status != 200:
                        logger.error("Failed to download TMDB series export for yesterday too")
                        return None
                    data = await resp2.read()
            else:
                data = await resp.read()

    dest.write_bytes(data)
    logger.info(f"Downloaded TMDB series export: {dest} ({len(data):,} bytes)")
    return dest


def parse_series_export(export_path: Path) -> list[dict]:
    """Parse the TMDB daily TV series export into a list of dicts.

    Each line in the gzipped file is a JSON object with fields:
    id, original_name, popularity, adult
    """
    if export_path is None:
        return []

    series_list = []
    with gzip.open(export_path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                tmdb_id = entry.get("id")
                name = entry.get("original_name", "")
                popularity = entry.get("popularity", 0.0)
                adult = entry.get("adult", False)

                if tmdb_id and not adult:
                    series_list.append({
                        "tmdb_id": tmdb_id,
                        "name": name or f"Unknown Series {tmdb_id}",
                        "original_name": name,
                        "popularity": popularity,
                    })
            except json.JSONDecodeError:
                continue

    return series_list


def load_series(conn: sqlite3.Connection, series_list: list[dict]):
    """Bulk insert series into the database."""
    conn.executemany(
        """INSERT OR IGNORE INTO series (tmdb_id, name, original_name, popularity)
           VALUES (:tmdb_id, :name, :original_name, :popularity)""",
        series_list,
    )
    conn.commit()
    logger.info(f"Loaded {len(series_list):,} series into database")


def create_phase6_jobs(conn: sqlite3.Connection):
    """Create ingestion_log entries for Phase 6 (series video collection).

    Uses the series tmdb_id as the imdb_id field in ingestion_log for tracking
    (reusing the existing schema for simplicity).
    """
    cursor = conn.execute(
        "SELECT tmdb_id FROM series ORDER BY popularity DESC"
    )
    tmdb_ids = [str(row[0]) for row in cursor.fetchall()]

    conn.executemany(
        "INSERT OR IGNORE INTO ingestion_log (phase, imdb_id, status) VALUES ('series_videos', ?, 'pending')",
        [(tmdb_id,) for tmdb_id in tmdb_ids],
    )
    conn.commit()
    logger.info(f"Created {len(tmdb_ids):,} Phase 6 jobs")


async def run():
    """Execute Phase 5: Series Bootstrap."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    logger.info("=== Phase 5: Series Bootstrap ===")

    # 1. Initialize database (ensures new tables exist)
    init_db_sync()
    logger.info(f"Database initialized at {DB_PATH}")

    # 2. Download TMDB TV series export
    export_path = await download_tmdb_series_export()
    if export_path is None:
        logger.error("Could not download TMDB series export. Aborting.")
        return

    # 3. Parse and load series
    logger.info(f"Parsing {export_path}")
    series_list = parse_series_export(export_path)
    logger.info(f"Parsed {len(series_list):,} series (excluding adult content)")

    conn = sqlite3.connect(DB_PATH)
    load_series(conn, series_list)

    # 4. Create Phase 6 jobs
    create_phase6_jobs(conn)

    # Summary
    cursor = conn.execute("SELECT COUNT(*) FROM series")
    total = cursor.fetchone()[0]
    logger.info(f"=== Series Bootstrap complete: {total:,} series in database ===")

    conn.close()
