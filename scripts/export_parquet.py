"""Export database tables to Parquet format for HuggingFace Datasets.

Exports movies, trailers, genres, and movie_genres as Parquet files.
Only includes movies that have at least one trailer.
"""

import sqlite3
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "db" / "trailerdb.db"
OUTPUT_DIR = PROJECT_ROOT / "dist" / "parquet"


def export_parquet():
    print("=== TrailerDB Parquet Export ===")
    print(f"Source: {DB_PATH}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH))

    # Movies (only those with trailers)
    print("Exporting movies.parquet...")
    movies_df = pd.read_sql_query(
        """
        SELECT m.imdb_id, m.tmdb_id, m.title, m.original_title, m.year,
               m.imdb_rating, m.imdb_votes, m.tmdb_popularity,
               m.poster_path, m.backdrop_path, m.overview,
               m.runtime, m.original_language
        FROM movies m
        WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers)
        ORDER BY m.imdb_votes DESC NULLS LAST
        """,
        conn,
    )
    pq.write_table(
        pa.Table.from_pandas(movies_df, preserve_index=False),
        OUTPUT_DIR / "movies.parquet",
        compression="snappy",
    )
    print(f"  movies.parquet: {len(movies_df):,} rows")

    # Trailers (joined with movies to include imdb_id)
    print("Exporting trailers.parquet...")
    trailers_df = pd.read_sql_query(
        """
        SELECT m.imdb_id, t.youtube_id, t.title, t.trailer_type,
               t.language, t.region, t.is_official, t.published_at,
               t.source, t.channel_name, t.channel_id,
               t.duration_seconds, t.view_count, t.like_count,
               t.yt_title, t.is_available
        FROM trailers t
        JOIN movies m ON m.id = t.movie_id
        ORDER BY m.imdb_id, t.published_at
        """,
        conn,
    )
    pq.write_table(
        pa.Table.from_pandas(trailers_df, preserve_index=False),
        OUTPUT_DIR / "trailers.parquet",
        compression="snappy",
    )
    print(f"  trailers.parquet: {len(trailers_df):,} rows")

    # Genres
    print("Exporting genres.parquet...")
    genres_df = pd.read_sql_query(
        "SELECT id, name FROM genres ORDER BY id",
        conn,
    )
    pq.write_table(
        pa.Table.from_pandas(genres_df, preserve_index=False),
        OUTPUT_DIR / "genres.parquet",
        compression="snappy",
    )
    print(f"  genres.parquet: {len(genres_df):,} rows")

    # Movie genres (only for movies with trailers)
    print("Exporting movie_genres.parquet...")
    movie_genres_df = pd.read_sql_query(
        """
        SELECT m.imdb_id, g.name AS genre
        FROM movie_genres mg
        JOIN movies m ON m.id = mg.movie_id
        JOIN genres g ON g.id = mg.genre_id
        WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers)
        ORDER BY m.imdb_id, g.name
        """,
        conn,
    )
    pq.write_table(
        pa.Table.from_pandas(movie_genres_df, preserve_index=False),
        OUTPUT_DIR / "movie_genres.parquet",
        compression="snappy",
    )
    print(f"  movie_genres.parquet: {len(movie_genres_df):,} rows")

    conn.close()

    # Print file sizes
    print()
    total_size = 0
    for f in sorted(OUTPUT_DIR.glob("*.parquet")):
        size = f.stat().st_size
        total_size += size
        print(f"  {f.name}: {size / 1024 / 1024:.1f} MB")
    print(f"  Total: {total_size / 1024 / 1024:.1f} MB")

    print()
    print("=== Parquet export complete ===")


if __name__ == "__main__":
    export_parquet()
