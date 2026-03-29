"""Export database to CSV format for Kaggle distribution.

Exports a denormalized movies.csv (with genres and trailer counts)
and a trailers.csv joined with movie IMDb IDs.
"""

import csv
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "db" / "trailerdb.db"
OUTPUT_DIR = PROJECT_ROOT / "dist" / "csv"


def export_csv():
    print("=== TrailerDB CSV Export ===")
    print(f"Source: {DB_PATH}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH))

    # Build genre lookup: movie internal id -> comma-separated genre names
    print("Building genre lookup...")
    genre_map = {}
    cursor = conn.execute("""
        SELECT mg.movie_id, GROUP_CONCAT(g.name, ', ')
        FROM movie_genres mg
        JOIN genres g ON g.id = mg.genre_id
        GROUP BY mg.movie_id
    """)
    for movie_id, genres_str in cursor.fetchall():
        genre_map[movie_id] = genres_str or ""

    # Build trailer count lookup
    trailer_counts = {}
    cursor = conn.execute("SELECT movie_id, COUNT(*) FROM trailers GROUP BY movie_id")
    for movie_id, count in cursor.fetchall():
        trailer_counts[movie_id] = count

    # Export movies.csv
    print("Exporting movies.csv...")
    movies_path = OUTPUT_DIR / "movies.csv"
    movie_columns = [
        "imdb_id", "tmdb_id", "title", "year", "rating", "votes",
        "runtime", "overview", "poster_path", "genres_list", "trailer_count",
    ]

    cursor = conn.execute("""
        SELECT m.id, m.imdb_id, m.tmdb_id, m.title, m.year,
               m.imdb_rating, m.imdb_votes, m.runtime, m.overview, m.poster_path
        FROM movies m
        WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers)
        ORDER BY m.imdb_votes DESC NULLS LAST
    """)

    movie_count = 0
    with open(movies_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(movie_columns)
        for row in cursor:
            mid, imdb_id, tmdb_id, title, year, rating, votes, runtime, overview, poster = row
            writer.writerow([
                imdb_id,
                tmdb_id,
                title,
                year,
                rating,
                votes,
                runtime,
                overview,
                poster,
                genre_map.get(mid, ""),
                trailer_counts.get(mid, 0),
            ])
            movie_count += 1

    print(f"  movies.csv: {movie_count:,} rows")

    # Export trailers.csv
    print("Exporting trailers.csv...")
    trailers_path = OUTPUT_DIR / "trailers.csv"
    trailer_columns = [
        "imdb_id", "youtube_id", "title", "type", "language", "region",
        "is_official", "published_at", "channel_name", "duration_seconds",
        "view_count",
    ]

    cursor = conn.execute("""
        SELECT m.imdb_id, t.youtube_id, t.title, t.trailer_type,
               t.language, t.region, t.is_official, t.published_at,
               t.channel_name, t.duration_seconds, t.view_count
        FROM trailers t
        JOIN movies m ON m.id = t.movie_id
        ORDER BY m.imdb_id, t.published_at
    """)

    trailer_count = 0
    with open(trailers_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(trailer_columns)
        for row in cursor:
            writer.writerow(row)
            trailer_count += 1

    print(f"  trailers.csv: {trailer_count:,} rows")

    conn.close()

    # Print file sizes
    print()
    total_size = 0
    for f in sorted(OUTPUT_DIR.glob("*.csv")):
        size = f.stat().st_size
        total_size += size
        print(f"  {f.name}: {size / 1024 / 1024:.1f} MB")
    print(f"  Total: {total_size / 1024 / 1024:.1f} MB")

    print()
    print("=== CSV export complete ===")


if __name__ == "__main__":
    export_csv()
