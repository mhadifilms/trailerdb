"""Local SQLite database query layer for TrailerDB CLI."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
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


def _require_db() -> None:
    """Raise FileNotFoundError if the local database does not exist."""
    if not db_exists():
        raise FileNotFoundError(
            "Local database not found. Run 'trailerdb db download' first."
        )


# ---------------------------------------------------------------------------
# Movies
# ---------------------------------------------------------------------------


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
                   duration_seconds, view_count, like_count, channel_id
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
                "channel_id": r["channel_id"],
                "duration": r["duration_seconds"],
                "views": r["view_count"],
                "likes": r["like_count"],
            }
            for r in trailer_cursor.fetchall()
        ]

        # Trailer groups
        group_cursor = conn.execute(
            """
            SELECT id, trailer_type, canonical_title, published_at,
                   languages, trailer_count
            FROM trailer_groups
            WHERE movie_id = ?
            ORDER BY published_at DESC
            """,
            (mid,),
        )
        movie["trailer_groups"] = [dict(r) for r in group_cursor.fetchall()]

        return movie
    finally:
        conn.close()


def get_movie_languages(imdb_id: str) -> list[dict[str, Any]]:
    """Get language breakdown for a movie's trailers."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT t.language, COUNT(*) as count,
                   SUM(t.view_count) as total_views
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE m.imdb_id = ? AND t.is_available = 1 AND t.language IS NOT NULL
            GROUP BY t.language
            ORDER BY count DESC
            """,
            (imdb_id,),
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def get_movie_engagement(imdb_id: str) -> dict[str, Any]:
    """Get YouTube engagement stats for a movie's trailers."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT
                COUNT(*) as trailer_count,
                SUM(t.view_count) as total_views,
                SUM(t.like_count) as total_likes,
                AVG(t.view_count) as avg_views,
                MAX(t.view_count) as max_views,
                AVG(t.duration_seconds) as avg_duration
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE m.imdb_id = ? AND t.is_available = 1
            """,
            (imdb_id,),
        )
        row = cursor.fetchone()
        result = dict(row) if row else {}

        # Most viewed trailer
        top_cursor = conn.execute(
            """
            SELECT t.youtube_id, t.title, t.trailer_type, t.language,
                   t.view_count, t.like_count, t.duration_seconds
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE m.imdb_id = ? AND t.is_available = 1
            ORDER BY t.view_count DESC
            LIMIT 5
            """,
            (imdb_id,),
        )
        result["top_trailers"] = [dict(r) for r in top_cursor.fetchall()]

        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Series
# ---------------------------------------------------------------------------


def search_series(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search series by name in the local database."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT s.tmdb_id, s.name, s.first_air_date, s.vote_average,
                   s.vote_count, s.number_of_seasons, s.status,
                   COUNT(st.id) as trailer_count
            FROM series s
            LEFT JOIN series_trailers st ON st.series_id = s.id AND st.is_available = 1
            WHERE s.name LIKE ? COLLATE NOCASE
            GROUP BY s.id
            ORDER BY s.vote_count DESC
            LIMIT ?
            """,
            (f"%{query}%", limit),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_series_detail(identifier: str) -> dict[str, Any] | None:
    """Get full series detail by TMDB ID or name search."""
    conn = get_connection()
    try:
        # Try as TMDB ID first
        if identifier.isdigit():
            cursor = conn.execute(
                """
                SELECT s.id, s.tmdb_id, s.name, s.original_name,
                       s.first_air_date, s.overview, s.poster_path,
                       s.backdrop_path, s.status, s.number_of_seasons,
                       s.vote_average, s.vote_count, s.popularity,
                       s.original_language
                FROM series s
                WHERE s.tmdb_id = ?
                """,
                (int(identifier),),
            )
        else:
            cursor = conn.execute(
                """
                SELECT s.id, s.tmdb_id, s.name, s.original_name,
                       s.first_air_date, s.overview, s.poster_path,
                       s.backdrop_path, s.status, s.number_of_seasons,
                       s.vote_average, s.vote_count, s.popularity,
                       s.original_language
                FROM series s
                WHERE s.name LIKE ? COLLATE NOCASE
                ORDER BY s.vote_count DESC
                LIMIT 1
                """,
                (f"%{identifier}%",),
            )

        row = cursor.fetchone()
        if row is None:
            return None

        series = dict(row)
        sid = series["id"]

        # Genres
        genre_cursor = conn.execute(
            """
            SELECT g.name FROM genres g
            JOIN series_genres sg ON sg.genre_id = g.id
            WHERE sg.series_id = ?
            ORDER BY g.name
            """,
            (sid,),
        )
        series["genres"] = [r["name"] for r in genre_cursor.fetchall()]

        # Trailers
        trailer_cursor = conn.execute(
            """
            SELECT youtube_id, title, trailer_type, language, region,
                   is_official, published_at, quality, channel_name,
                   duration_seconds, view_count, like_count, season_number
            FROM series_trailers
            WHERE series_id = ? AND is_available = 1
            ORDER BY
                season_number ASC NULLS FIRST,
                CASE trailer_type
                    WHEN 'trailer' THEN 0 WHEN 'teaser' THEN 1
                    WHEN 'clip' THEN 2 WHEN 'featurette' THEN 3
                    ELSE 4
                END,
                published_at DESC
            """,
            (sid,),
        )
        series["trailers"] = [
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
                "likes": r["like_count"],
                "season_number": r["season_number"],
            }
            for r in trailer_cursor.fetchall()
        ]

        return series
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------


def get_language_stats() -> list[dict[str, Any]]:
    """Get trailer counts and coverage percentage per language."""
    conn = get_connection()
    try:
        total_cursor = conn.execute(
            "SELECT COUNT(*) FROM trailers WHERE is_available = 1"
        )
        total = total_cursor.fetchone()[0] or 1

        cursor = conn.execute(
            """
            SELECT language, COUNT(*) as trailer_count,
                   COUNT(DISTINCT movie_id) as movie_count
            FROM trailers
            WHERE is_available = 1 AND language IS NOT NULL
            GROUP BY language
            ORDER BY trailer_count DESC
            """,
        )
        results = []
        for row in cursor.fetchall():
            r = dict(row)
            r["coverage_pct"] = (r["trailer_count"] / total) * 100
            results.append(r)
        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------


def get_channel_stats(top_n: int = 20) -> list[dict[str, Any]]:
    """Get top YouTube channels by trailer count."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT channel_name, COUNT(*) as trailer_count,
                   SUM(view_count) as total_views,
                   AVG(view_count) as avg_views
            FROM trailers
            WHERE is_available = 1 AND channel_name IS NOT NULL
                  AND channel_name != ''
            GROUP BY channel_name
            ORDER BY trailer_count DESC
            LIMIT ?
            """,
            (top_n,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Trending / New / Top-Rated
# ---------------------------------------------------------------------------


def get_trending(limit: int = 20) -> list[dict[str, Any]]:
    """Get trending movies/series based on recent trailer activity and views."""
    conn = get_connection()
    try:
        # Movies with recent trailers that have high view velocity
        cursor = conn.execute(
            """
            SELECT m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes,
                   COUNT(t.id) as trailer_count,
                   SUM(t.view_count) as total_views,
                   MAX(t.published_at) as latest_trailer
            FROM movies m
            JOIN trailers t ON t.movie_id = m.id AND t.is_available = 1
            WHERE t.published_at IS NOT NULL
            GROUP BY m.id
            ORDER BY MAX(t.published_at) DESC, SUM(t.view_count) DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_top_rated(min_votes: int = 10000, limit: int = 20) -> list[dict[str, Any]]:
    """Get top-rated movies that have trailers."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes,
                   COUNT(t.id) as trailer_count,
                   SUM(t.view_count) as total_views
            FROM movies m
            JOIN trailers t ON t.movie_id = m.id AND t.is_available = 1
            WHERE m.imdb_rating IS NOT NULL AND m.imdb_votes >= ?
            GROUP BY m.id
            ORDER BY m.imdb_rating DESC, m.imdb_votes DESC
            LIMIT ?
            """,
            (min_votes, limit),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_new_trailers(days: int = 7, limit: int = 50) -> list[dict[str, Any]]:
    """Get recently published trailers."""
    conn = get_connection()
    try:
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        cursor = conn.execute(
            """
            SELECT t.youtube_id, t.title as trailer_title, t.trailer_type,
                   t.language, t.published_at, t.view_count, t.duration_seconds,
                   t.channel_name, m.title as movie_title, m.imdb_id, m.year
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.is_available = 1 AND t.published_at >= ?
            ORDER BY t.published_at DESC
            LIMIT ?
            """,
            (cutoff, limit),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------


def get_movie_compare_data(imdb_id: str) -> dict[str, Any] | None:
    """Get movie data optimized for comparison."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes,
                   m.runtime, m.original_language
            FROM movies m WHERE m.imdb_id = ?
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
            """,
            (mid,),
        )
        movie["genres"] = [r["name"] for r in genre_cursor.fetchall()]

        # Trailer stats
        stats_cursor = conn.execute(
            """
            SELECT COUNT(*) as trailer_count,
                   SUM(view_count) as total_views,
                   SUM(like_count) as total_likes,
                   AVG(view_count) as avg_views,
                   MAX(view_count) as max_views,
                   AVG(duration_seconds) as avg_duration,
                   COUNT(DISTINCT language) as language_count
            FROM trailers
            WHERE movie_id = ? AND is_available = 1
            """,
            (mid,),
        )
        movie["trailer_stats"] = dict(stats_cursor.fetchone())

        # Language list
        lang_cursor = conn.execute(
            """
            SELECT DISTINCT language FROM trailers
            WHERE movie_id = ? AND is_available = 1 AND language IS NOT NULL
            ORDER BY language
            """,
            (mid,),
        )
        movie["languages"] = [r["language"] for r in lang_cursor.fetchall()]

        return movie
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


def get_analytics() -> dict[str, Any]:
    """Get comprehensive analytics for the terminal dashboard."""
    conn = get_connection()
    try:
        analytics: dict[str, Any] = {}

        # Totals
        cursor = conn.execute("SELECT COUNT(*) FROM movies")
        analytics["total_movies"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(DISTINCT movie_id) FROM trailers WHERE is_available = 1"
        )
        analytics["movies_with_trailers"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(*) FROM trailers WHERE is_available = 1"
        )
        analytics["total_trailers"] = cursor.fetchone()[0]

        cursor = conn.execute("SELECT COUNT(*) FROM series")
        analytics["total_series"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(*) FROM series_trailers WHERE is_available = 1"
        )
        analytics["total_series_trailers"] = cursor.fetchone()[0]

        # Views / Likes
        cursor = conn.execute(
            """
            SELECT SUM(view_count) as total_views,
                   SUM(like_count) as total_likes,
                   AVG(view_count) as avg_views,
                   AVG(duration_seconds) as avg_duration
            FROM trailers WHERE is_available = 1
            """
        )
        row = cursor.fetchone()
        analytics["total_views"] = row["total_views"] or 0
        analytics["total_likes"] = row["total_likes"] or 0
        analytics["avg_views"] = row["avg_views"] or 0
        analytics["avg_duration"] = row["avg_duration"] or 0

        # Most viewed trailers
        cursor = conn.execute(
            """
            SELECT t.youtube_id, t.title, t.trailer_type, t.language,
                   t.view_count, t.like_count, m.title as movie_title,
                   m.imdb_id, m.year
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.is_available = 1
            ORDER BY t.view_count DESC
            LIMIT 10
            """
        )
        analytics["most_viewed"] = [dict(r) for r in cursor.fetchall()]

        # Top channels
        cursor = conn.execute(
            """
            SELECT channel_name, COUNT(*) as trailer_count,
                   SUM(view_count) as total_views
            FROM trailers
            WHERE is_available = 1 AND channel_name IS NOT NULL
                  AND channel_name != ''
            GROUP BY channel_name
            ORDER BY trailer_count DESC
            LIMIT 10
            """
        )
        analytics["top_channels"] = [dict(r) for r in cursor.fetchall()]

        # Language breakdown (top 15)
        cursor = conn.execute(
            """
            SELECT language, COUNT(*) as count
            FROM trailers
            WHERE is_available = 1 AND language IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
            LIMIT 15
            """
        )
        analytics["top_languages"] = [dict(r) for r in cursor.fetchall()]

        # Type breakdown
        cursor = conn.execute(
            """
            SELECT trailer_type, COUNT(*) as count
            FROM trailers WHERE is_available = 1
            GROUP BY trailer_type ORDER BY count DESC
            """
        )
        analytics["by_type"] = [dict(r) for r in cursor.fetchall()]

        # Language count
        cursor = conn.execute(
            "SELECT COUNT(DISTINCT language) FROM trailers WHERE language IS NOT NULL"
        )
        analytics["language_count"] = cursor.fetchone()[0]

        return analytics
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Trailer Info (by YouTube ID)
# ---------------------------------------------------------------------------


def get_trailer_by_youtube_id(youtube_id: str) -> dict[str, Any] | None:
    """Look up a trailer by its YouTube ID."""
    conn = get_connection()
    try:
        # Try movie trailers first
        cursor = conn.execute(
            """
            SELECT t.youtube_id, t.title, t.trailer_type, t.language, t.region,
                   t.is_official, t.published_at, t.quality, t.channel_name,
                   t.channel_id, t.duration_seconds, t.view_count, t.like_count,
                   t.yt_title, m.title as movie_title, m.imdb_id, m.year,
                   m.imdb_rating, 'movie' as content_type
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.youtube_id = ?
            """,
            (youtube_id,),
        )
        row = cursor.fetchone()
        if row:
            result = dict(row)
            # Get subtitles
            sub_cursor = conn.execute(
                """
                SELECT language, is_auto_generated
                FROM trailer_subtitles
                WHERE youtube_id = ?
                ORDER BY is_auto_generated, language
                """,
                (youtube_id,),
            )
            result["subtitles"] = [dict(r) for r in sub_cursor.fetchall()]

            # Get audio tracks
            audio_cursor = conn.execute(
                """
                SELECT language, is_original, display_name
                FROM trailer_audio_tracks
                WHERE youtube_id = ?
                ORDER BY is_original DESC, language
                """,
                (youtube_id,),
            )
            result["audio_tracks"] = [dict(r) for r in audio_cursor.fetchall()]

            # Get formats
            fmt_cursor = conn.execute(
                """
                SELECT format_id, height, width, vcodec, acodec, fps, filesize
                FROM trailer_formats
                WHERE youtube_id = ?
                ORDER BY height DESC
                """,
                (youtube_id,),
            )
            result["formats"] = [dict(r) for r in fmt_cursor.fetchall()]
            return result

        # Try series trailers
        cursor = conn.execute(
            """
            SELECT st.youtube_id, st.title, st.trailer_type, st.language, st.region,
                   st.is_official, st.published_at, st.quality, st.channel_name,
                   st.channel_id, st.duration_seconds, st.view_count, st.like_count,
                   st.yt_title, st.season_number, s.name as series_name,
                   s.tmdb_id, 'series' as content_type
            FROM series_trailers st
            JOIN series s ON s.id = st.series_id
            WHERE st.youtube_id = ?
            """,
            (youtube_id,),
        )
        row = cursor.fetchone()
        if row:
            return dict(row)

        return None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# DB Info
# ---------------------------------------------------------------------------


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

        cursor = conn.execute("SELECT COUNT(*) FROM series")
        info["total_series"] = cursor.fetchone()[0]

        cursor = conn.execute(
            "SELECT COUNT(*) FROM series_trailers WHERE is_available = 1"
        )
        info["total_series_trailers"] = cursor.fetchone()[0]

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

        # YouTube engagement
        cursor = conn.execute(
            """
            SELECT SUM(view_count) as total_views,
                   SUM(like_count) as total_likes,
                   AVG(duration_seconds) as avg_duration
            FROM trailers WHERE is_available = 1
            """
        )
        row = cursor.fetchone()
        info["total_views"] = row["total_views"] or 0
        info["total_likes"] = row["total_likes"] or 0
        info["avg_duration"] = row["avg_duration"] or 0

        # Top 5 most viewed
        cursor = conn.execute(
            """
            SELECT t.youtube_id, t.title, t.view_count, t.trailer_type,
                   m.title as movie_title, m.imdb_id
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.is_available = 1
            ORDER BY t.view_count DESC
            LIMIT 5
            """
        )
        info["most_viewed"] = [dict(r) for r in cursor.fetchall()]

        # DB file size
        db_path = get_db_path()
        info["db_size_bytes"] = db_path.stat().st_size

        return info
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Batch / Filtered Queries
# ---------------------------------------------------------------------------


def query_trailers_filtered(
    genre: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    rating_min: float | None = None,
    lang: str | None = None,
    trailer_type: str | None = None,
    has_subs: bool | None = None,
    channel: str | None = None,
    views_min: int | None = None,
    views_max: int | None = None,
    duration_min: int | None = None,
    duration_max: int | None = None,
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

        if has_subs:
            conditions.append(
                "t.youtube_id IN (SELECT DISTINCT youtube_id FROM trailer_subtitles)"
            )

        if channel:
            conditions.append("t.channel_name LIKE ?")
            params.append(f"%{channel}%")

        if views_min is not None:
            conditions.append("t.view_count >= ?")
            params.append(views_min)

        if views_max is not None:
            conditions.append("t.view_count <= ?")
            params.append(views_max)

        if duration_min is not None:
            conditions.append("t.duration_seconds >= ?")
            params.append(duration_min)

        if duration_max is not None:
            conditions.append("t.duration_seconds <= ?")
            params.append(duration_max)

        where = " AND ".join(conditions)

        cursor = conn.execute(
            f"""
            SELECT m.title, m.year, m.imdb_id, t.youtube_id, t.title as trailer_title,
                   t.trailer_type, t.language, t.view_count, t.duration_seconds,
                   t.channel_name, t.like_count
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


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_data(
    format_type: str = "json",
    genre: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    rating_min: float | None = None,
    lang: str | None = None,
    trailer_type: str | None = None,
) -> list[dict[str, Any]]:
    """Export filtered trailer data."""
    return query_trailers_filtered(
        genre=genre,
        year_min=year_min,
        year_max=year_max,
        rating_min=rating_min,
        lang=lang,
        trailer_type=trailer_type,
    )
