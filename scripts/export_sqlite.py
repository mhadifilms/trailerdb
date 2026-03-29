"""Export a clean SQLite database for distribution.

Copies the main database, drops internal tables, adds dataset metadata,
and compresses the result for distribution.
"""

import gzip
import os
import shutil
import sqlite3
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "db" / "trailerdb.db"
DIST_DIR = PROJECT_ROOT / "dist"
OUTPUT_DB = DIST_DIR / "trailerdb.db"
OUTPUT_GZ = DIST_DIR / "trailerdb.db.gz"

VERSION = "1.0.0"
DESCRIPTION = (
    "TrailerDB: A comprehensive dataset of movies and their trailers. "
    "Contains movie metadata from TMDB/IMDb and trailer information from YouTube."
)


def export_sqlite():
    print("=== TrailerDB SQLite Export ===")
    print(f"Source: {DB_PATH}")
    print(f"Output: {OUTPUT_GZ}")
    print()

    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        return

    DIST_DIR.mkdir(parents=True, exist_ok=True)

    # Copy database
    print("Copying database...")
    shutil.copy2(DB_PATH, OUTPUT_DB)

    conn = sqlite3.connect(str(OUTPUT_DB))

    # Drop internal tables
    print("Dropping internal tables...")
    conn.execute("DROP TABLE IF EXISTS ingestion_log")

    # Get counts for metadata
    movie_count = conn.execute(
        "SELECT COUNT(DISTINCT movie_id) FROM trailers"
    ).fetchone()[0]
    trailer_count = conn.execute("SELECT COUNT(*) FROM trailers").fetchone()[0]

    # Create dataset_info table
    print("Adding dataset_info table...")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dataset_info (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    info = {
        "version": VERSION,
        "export_date": date.today().isoformat(),
        "movie_count": str(movie_count),
        "trailer_count": str(trailer_count),
        "description": DESCRIPTION,
    }
    for key, value in info.items():
        conn.execute(
            "INSERT OR REPLACE INTO dataset_info (key, value) VALUES (?, ?)",
            (key, value),
        )
    conn.commit()

    # Vacuum to reclaim space
    print("Running VACUUM...")
    conn.execute("VACUUM")
    conn.close()

    raw_size = os.path.getsize(OUTPUT_DB)
    print(f"  Uncompressed: {raw_size / 1024 / 1024:.1f} MB")

    # Compress with gzip
    print("Compressing with gzip...")
    with open(OUTPUT_DB, "rb") as f_in:
        with gzip.open(OUTPUT_GZ, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)

    gz_size = os.path.getsize(OUTPUT_GZ)
    ratio = (1 - gz_size / raw_size) * 100 if raw_size > 0 else 0
    print(f"  Compressed:   {gz_size / 1024 / 1024:.1f} MB ({ratio:.1f}% reduction)")

    # Remove uncompressed copy
    OUTPUT_DB.unlink()

    print()
    print(f"  Movies:   {movie_count:,}")
    print(f"  Trailers: {trailer_count:,}")
    print()
    print("=== SQLite export complete ===")


if __name__ == "__main__":
    export_sqlite()
