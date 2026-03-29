"""Local SQLite database query layer for TrailerDB CLI."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path.home() / ".trailerdb" / "trailerdb.db"


def get_db_path() -> Path:
    """Return the path to the local database."""
    return DEFAULT_DB_PATH


def db_exists() -> bool:
    """Check if the local database file exists."""
    return get_db_path().is_file()


def get_connection() -> sqlite3.Connection:
    """Open a read-only connection to the local database."""
    path = get_db_path()
    if not path.is_file():
        raise FileNotFoundError(
            f"Local database not found at {path}. "
            "Run 'trailerdb db download' first."
        )
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA query_only=ON")
    return conn


def search_movies(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search movies by title in the local database."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes,
                   COUNT(t.id) as trailer_count
            FROM movies m
            LEFT JOIN trailers t ON t.movie_id = m.id AND t.is_available = 1
            WHERE m.title LIKE ? COLLATE NOCASE
            GROUP BY m.id
            ORDER BY m.imdb_votes DESC
            LIMIT ?
            """,
            (f"%{query}%", limit),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_movie_detail(imdb_id: str) -> dict[str, Any] | None:
    """Get full movie detail by IMDb ID from local database."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT m.imdb_id, m.tmdb_id, m.title, m.original_title, m.year,
                   m.imdb_rating, m.imdb_votes, m.runtime, m.overview,
                   m.poster_path, m.backdrop_path, m.original_language
            FROM movies m
            WHERE m.imdb_id = ?
            """,
            (imdb_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None

        movie = dict(row)
        mid_cursor = conn.execute(
            "SELECT id FROM movies WHERE imdb_id = ?", (imdb_id,)
        )
        mid = mid_cursor.fetchone()["id"]

        # Genres
        genre_cursor = conn.execute(
            """
            SELECT g.name FROM genres g
            JOIN movie_genres mg ON mg.genre_id = g.id
            WHERE mg.movie_id = ?
            ORDER BY g.name
            """,
            (mid,),
        )
        movie["genres"] = [r["name"] for r in genre_cursor.fetchall()]

        # Trailers
        trailer_cursor = conn.execute(
            """
            SELECT youtube_id, title, trailer_type, language, region,
                   is_official, published_at, quality, channel_name,
                   duration_seconds, view_count
            FROM trailers
            WHERE movie_id = ? AND is_available = 1
            ORDER BY
                CASE trailer_type
                    WHEN 'trailer' THEN 0 WHEN 'teaser' THEN 1
                    WHEN 'tv_spot' THEN 2 WHEN 'red_band' THEN 3
                    WHEN 'imax' THEN 4 WHEN 'clip' THEN 5
                    WHEN 'featurette' THEN 6 WHEN 'behind_the_scenes' THEN 7
                    WHEN 'bloopers' THEN 8 ELSE 9
                END,
                is_official DESC,
                published_at DESC
            """,
            (mid,),
        )
        movie["trailers"] = [
            {
                "youtube_id": r["youtube_id"],
                "title": r["title"],
                "type": r["trailer_type"],
                "language": r["language"],
                "region": r["region"],
                "is_official": bool(r["is_official"]),
                "published_at": r["published_at"],
                "quality": r["quality"],
                "channel_name": r["channel_name"],
                "duration": r["duration_seconds"],
                "views": r["view_count"],
            }
            for r in trailer_cursor.fetchall()
        ]

        return movie
    finally:
        conn.close()


def get_db_info() -> dict[str, Any]:
    """Get stats about the local database."""
    conn = get_connection()
    try:
        info: dict[str, Any] = {}

        cursor = conn.execute("SELECT COUNT(*) FROM movies")
        info["total_movies"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(DISTINCT movie_id) FROM trailers"
        )
        info["movies_with_trailers"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(*) FROM trailers WHERE is_available = 1"
        )
        info["total_trailers"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(DISTINCT language) FROM trailers WHERE language IS NOT NULL"
        )
        info["languages"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT trailer_type, COUNT(*) FROM trailers "
            "WHERE is_available = 1 GROUP BY trailer_type ORDER BY COUNT(*) DESC"
        )
        info["by_type"] = {row[0]: row[1] for row in cursor.fetchall()}

        cursor = conn.execute(
            "SELECT language, COUNT(*) FROM trailers "
            "WHERE language IS NOT NULL AND is_available = 1 "
            "GROUP BY language ORDER BY COUNT(*) DESC LIMIT 20"
        )
        info["by_language"] = {row[0]: row[1] for row in cursor.fetchall()}

        # DB file size
        db_path = get_db_path()
        info["db_size_bytes"] = db_path.stat().st_size

        return info
    finally:
        conn.close()


def query_trailers_filtered(
    genre: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    rating_min: float | None = None,
    lang: str | None = None,
    trailer_type: str | None = None,
) -> list[dict[str, Any]]:
    """Query trailers with filters from the local database.

    Returns a list of dicts with movie info and trailer YouTube URLs.
    """
    conn = get_connection()
    try:
        conditions = ["t.is_available = 1"]
        params: list[Any] = []

        if genre:
            conditions.append(
                "m.id IN (SELECT mg.movie_id FROM movie_genres mg "
                "JOIN genres g ON g.id = mg.genre_id WHERE LOWER(g.name) = LOWER(?))"
            )
            params.append(genre)

        if year_min is not None:
            conditions.append("m.year >= ?")
            params.append(year_min)

        if year_max is not None:
            conditions.append("m.year <= ?")
            params.append(year_max)

        if rating_min is not None:
            conditions.append("m.imdb_rating >= ?")
            params.append(rating_min)

        if lang:
            conditions.append("t.language = ?")
            params.append(lang)

        if trailer_type:
            conditions.append("t.trailer_type = ?")
            params.append(trailer_type)

        where = " AND ".join(conditions)

        cursor = conn.execute(
            f"""
            SELECT m.title, m.year, m.imdb_id, t.youtube_id, t.title as trailer_title,
                   t.trailer_type, t.language, t.view_count
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE {where}
            ORDER BY m.imdb_votes DESC, t.view_count DESC
            """,
            params,
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
