"""Export SQLite database to static JSON files for the web application."""

import json
import os
import re
import sqlite3
import statistics
import unicodedata
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db" / "trailerdb.db"
OUTPUT_DIR = Path(__file__).parent.parent / "site" / "public" / "data"
SITEMAP_DIR = Path(__file__).parent.parent / "site" / "public"

# Trailer type display order
TYPE_ORDER = [
    "trailer", "teaser", "tv_spot", "red_band", "imax",
    "clip", "featurette", "behind_the_scenes", "bloopers",
]


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "untitled"


def make_slug(title: str, year: int | None, imdb_id: str) -> str:
    """Generate a unique URL slug for a movie."""
    parts = [slugify(title)]
    if year:
        parts.append(str(year))
    parts.append(imdb_id)
    return "-".join(parts)


def get_genre_map(conn: sqlite3.Connection) -> dict[int, str]:
    """Get genre ID to name mapping."""
    cursor = conn.execute("SELECT id, name FROM genres ORDER BY name")
    return {row[0]: row[1] for row in cursor.fetchall()}


def get_movie_genres(conn: sqlite3.Connection) -> dict[int, list[int]]:
    """Get genre IDs per movie."""
    cursor = conn.execute("SELECT movie_id, genre_id FROM movie_genres")
    result: dict[int, list[int]] = {}
    for movie_id, genre_id in cursor.fetchall():
        result.setdefault(movie_id, []).append(genre_id)
    return result


def get_movie_trailer_counts(conn: sqlite3.Connection) -> dict[int, int]:
    """Get trailer count per movie."""
    cursor = conn.execute("SELECT movie_id, COUNT(*) FROM trailers GROUP BY movie_id")
    return {row[0]: row[1] for row in cursor.fetchall()}


def export_index(conn: sqlite3.Connection, genre_map: dict, movie_genres: dict, trailer_counts: dict):
    """Export the compact browse index (Tier 1)."""
    print("Exporting browse index...")
    cursor = conn.execute("""
        SELECT m.id, m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes,
               m.poster_path, m.tmdb_id, m.tmdb_popularity
        FROM movies m
        WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers)
        ORDER BY m.imdb_votes DESC
    """)

    movies = []
    for row in cursor.fetchall():
        mid, imdb_id, title, year, rating, votes, poster, tmdb_id, popularity = row
        slug = make_slug(title, year, imdb_id)
        genres = movie_genres.get(mid, [])
        count = trailer_counts.get(mid, 0)

        movies.append([
            imdb_id, title, year, rating, votes,
            poster, genres, tmdb_id, slug, count, popularity or 0
        ])

    index = {
        "movies": movies,
        "fields": [
            "imdb_id", "title", "year", "rating", "votes",
            "poster", "genre_ids", "tmdb_id", "slug", "trailer_count", "popularity"
        ],
        "genres": {str(k): v for k, v in genre_map.items()},
    }

    output = OUTPUT_DIR / "index.json"
    output.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"  → {output} ({len(movies):,} movies, {output.stat().st_size / 1024 / 1024:.1f} MB)")
    return movies


def export_browse_shards(movies: list, genre_map: dict):
    """Export pre-sorted browse shards (Tier 2)."""
    print("Exporting browse shards...")
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    # Fields: imdb_id=0, title=1, year=2, rating=3, votes=4, poster=5, genres=6, tmdb_id=7, slug=8, count=9, popularity=10

    # Trending (top 100 by TMDB popularity)
    trending = sorted(movies, key=lambda m: m[10] or 0, reverse=True)[:100]
    (browse_dir / "trending.json").write_text(json.dumps(trending, separators=(",", ":")))

    # Top rated (top 100 by IMDb rating, min 10000 votes)
    top_rated = sorted(
        [m for m in movies if (m[4] or 0) >= 10000],
        key=lambda m: m[3] or 0, reverse=True
    )[:100]
    (browse_dir / "top-rated.json").write_text(json.dumps(top_rated, separators=(",", ":")))

    # Most trailers (top 100)
    most_trailers = sorted(movies, key=lambda m: m[9], reverse=True)[:100]
    (browse_dir / "most-trailers.json").write_text(json.dumps(most_trailers, separators=(",", ":")))

    # Recent (2020-2026)
    recent = sorted(
        [m for m in movies if m[2] and m[2] >= 2020],
        key=lambda m: (m[2], m[4] or 0), reverse=True
    )[:200]
    (browse_dir / "recent.json").write_text(json.dumps(recent, separators=(",", ":")))

    # By genre
    genre_dir = browse_dir / "genre"
    genre_dir.mkdir(parents=True, exist_ok=True)
    genre_id_to_slug = {}
    for gid, name in genre_map.items():
        genre_slug = slugify(name)
        genre_id_to_slug[gid] = genre_slug
        genre_movies = sorted(
            [m for m in movies if gid in m[6]],
            key=lambda m: m[4] or 0, reverse=True
        )[:200]
        if genre_movies:
            (genre_dir / f"{genre_slug}.json").write_text(
                json.dumps(genre_movies, separators=(",", ":"))
            )

    # By year (2000-2026)
    year_dir = browse_dir / "year"
    year_dir.mkdir(parents=True, exist_ok=True)
    for year in range(1920, 2027):
        year_movies = sorted(
            [m for m in movies if m[2] == year],
            key=lambda m: m[4] or 0, reverse=True
        )
        if year_movies:
            (year_dir / f"{year}.json").write_text(
                json.dumps(year_movies, separators=(",", ":"))
            )

    # By decade
    decade_dir = browse_dir / "decade"
    decade_dir.mkdir(parents=True, exist_ok=True)
    for decade_start in range(1920, 2030, 10):
        decade_movies = sorted(
            [m for m in movies if m[2] and decade_start <= m[2] < decade_start + 10],
            key=lambda m: m[4] or 0, reverse=True
        )[:200]
        if decade_movies:
            label = f"{decade_start}s"
            (decade_dir / f"{label}.json").write_text(
                json.dumps(decade_movies, separators=(",", ":"))
            )

    # Genre metadata for the site
    genre_meta = []
    for gid, name in sorted(genre_map.items(), key=lambda x: x[1]):
        count = len([m for m in movies if gid in m[6]])
        if count > 0:
            genre_meta.append({
                "id": gid, "name": name, "slug": genre_id_to_slug[gid], "count": count
            })
    (browse_dir / "genres.json").write_text(json.dumps(genre_meta, separators=(",", ":")))

    print(f"  → {browse_dir}/ (shards created)")


def export_movie_details(conn: sqlite3.Connection, movies: list, genre_map: dict, movie_genres: dict):
    """Export individual movie detail files (Tier 3)."""
    print("Exporting movie detail files...")
    movie_dir = OUTPUT_DIR / "movie"
    movie_dir.mkdir(parents=True, exist_ok=True)

    # Build imdb_id → movie index mapping
    imdb_to_idx = {}
    for i, m in enumerate(movies):
        imdb_to_idx[m[0]] = i

    # Fetch all movie details (include release_date if column exists)
    try:
        conn.execute("SELECT release_date FROM movies LIMIT 1")
        has_release_date = True
    except sqlite3.OperationalError:
        has_release_date = False

    if has_release_date:
        cursor = conn.execute("""
            SELECT id, imdb_id, tmdb_id, title, original_title, year,
                   imdb_rating, imdb_votes, runtime, overview,
                   poster_path, backdrop_path, original_language, release_date
            FROM movies
            WHERE id IN (SELECT DISTINCT movie_id FROM trailers)
        """)
    else:
        cursor = conn.execute("""
            SELECT id, imdb_id, tmdb_id, title, original_title, year,
                   imdb_rating, imdb_votes, runtime, overview,
                   poster_path, backdrop_path, original_language, NULL as release_date
            FROM movies
            WHERE id IN (SELECT DISTINCT movie_id FROM trailers)
        """)

    movie_rows = {row[0]: row for row in cursor.fetchall()}

    # Check if analytics columns exist
    try:
        conn.execute("SELECT days_before_release, confidence FROM trailers LIMIT 1")
        has_analytics = True
    except sqlite3.OperationalError:
        has_analytics = False

    # Fetch all trailers grouped by movie
    if has_analytics:
        trailer_cursor = conn.execute("""
            SELECT movie_id, youtube_id, title, trailer_type, language, region,
                   is_official, published_at, quality, channel_name, duration_seconds,
                   view_count, days_before_release, confidence
            FROM trailers
            WHERE is_available = 1
            ORDER BY movie_id,
                     CASE trailer_type
                         WHEN 'trailer' THEN 0 WHEN 'teaser' THEN 1 WHEN 'tv_spot' THEN 2
                         WHEN 'red_band' THEN 3 WHEN 'imax' THEN 4 WHEN 'clip' THEN 5
                         WHEN 'featurette' THEN 6 WHEN 'behind_the_scenes' THEN 7
                         WHEN 'bloopers' THEN 8 ELSE 9
                     END,
                     is_official DESC,
                     published_at DESC
        """)
    else:
        trailer_cursor = conn.execute("""
            SELECT movie_id, youtube_id, title, trailer_type, language, region,
                   is_official, published_at, quality, channel_name, duration_seconds,
                   view_count, NULL as days_before_release, NULL as confidence
            FROM trailers
            WHERE is_available = 1
            ORDER BY movie_id,
                     CASE trailer_type
                         WHEN 'trailer' THEN 0 WHEN 'teaser' THEN 1 WHEN 'tv_spot' THEN 2
                         WHEN 'red_band' THEN 3 WHEN 'imax' THEN 4 WHEN 'clip' THEN 5
                         WHEN 'featurette' THEN 6 WHEN 'behind_the_scenes' THEN 7
                         WHEN 'bloopers' THEN 8 ELSE 9
                     END,
                     is_official DESC,
                     published_at DESC
        """)

    trailers_by_movie: dict[int, list] = {}
    for row in trailer_cursor.fetchall():
        mid = row[0]
        trailer_obj = {
            "youtube_id": row[1],
            "title": row[2],
            "type": row[3],
            "language": row[4],
            "region": row[5],
            "is_official": bool(row[6]),
            "published_at": row[7],
            "quality": row[8],
            "channel_name": row[9],
            "duration": row[10],
            "views": row[11],
        }
        # Add analytics fields if present
        if row[12] is not None:
            trailer_obj["days_before_release"] = row[12]
        if row[13] is not None:
            trailer_obj["confidence"] = row[13]
        trailers_by_movie.setdefault(mid, []).append(trailer_obj)

    # Fetch trailer groups (if table exists)
    groups_by_movie: dict[int, list] = {}
    try:
        # Check if trailer_group_id column exists on trailers
        conn.execute("SELECT trailer_group_id FROM trailers LIMIT 1")
        has_groups = True
    except sqlite3.OperationalError:
        has_groups = False

    if has_groups:
        group_cursor = conn.execute("""
            SELECT tg.id, tg.movie_id, tg.trailer_type, tg.canonical_title,
                   tg.published_at, tg.languages, tg.trailer_count
            FROM trailer_groups tg
            ORDER BY tg.movie_id, tg.trailer_type
        """)
        for grow in group_cursor.fetchall():
            gid, gmid, gtype, gtitle, gpub, glangs, gcount = grow
            groups_by_movie.setdefault(gmid, []).append({
                "group_id": gid,
                "type": gtype,
                "title": gtitle,
                "published_at": gpub,
                "languages_list": glangs.split(",") if glangs else [],
                "trailer_count": gcount,
            })

        # Fetch trailers with their group_id for building the languages dict
        grouped_trailer_cursor = conn.execute("""
            SELECT t.trailer_group_id, t.youtube_id, t.title, t.language
            FROM trailers t
            WHERE t.is_available = 1 AND t.trailer_group_id IS NOT NULL
            ORDER BY t.trailer_group_id
        """)
        trailers_by_group: dict[int, list] = {}
        for trow in grouped_trailer_cursor.fetchall():
            tgid, tytid, ttitle, tlang = trow
            trailers_by_group.setdefault(tgid, []).append({
                "youtube_id": tytid,
                "title": ttitle,
                "language": tlang or "unknown",
            })

    count = 0
    for mid, row in movie_rows.items():
        _, imdb_id, tmdb_id, title, orig_title, year, rating, votes, \
            runtime, overview, poster, backdrop, orig_lang, release_date = row

        slug = make_slug(title, year, imdb_id)
        genres_list = [genre_map[gid] for gid in movie_genres.get(mid, []) if gid in genre_map]
        trailers = trailers_by_movie.get(mid, [])

        # Build trailer_groups structure for this movie
        trailer_groups_out = []
        if has_groups and mid in groups_by_movie:
            for grp in groups_by_movie[mid]:
                gid = grp["group_id"]
                languages_dict = {}
                for gt in trailers_by_group.get(gid, []):
                    lang_key = gt["language"]
                    languages_dict[lang_key] = {
                        "youtube_id": gt["youtube_id"],
                        "title": gt["title"],
                    }
                trailer_groups_out.append({
                    "group_id": gid,
                    "type": grp["type"],
                    "title": grp["title"],
                    "languages": languages_dict,
                })

        detail = {
            "imdb_id": imdb_id,
            "tmdb_id": tmdb_id,
            "title": title,
            "original_title": orig_title,
            "year": year,
            "release_date": release_date,
            "imdb_rating": rating,
            "imdb_votes": votes,
            "runtime": runtime,
            "overview": overview,
            "poster_path": poster,
            "backdrop_path": backdrop,
            "original_language": orig_lang,
            "genres": genres_list,
            "slug": slug,
            "trailers": trailers,
            "trailer_groups": trailer_groups_out,
        }

        filepath = movie_dir / f"{imdb_id}.json"
        filepath.write_text(json.dumps(detail, separators=(",", ":")), encoding="utf-8")
        count += 1

        if count % 10000 == 0:
            print(f"  → {count:,} movie files written...")

    print(f"  → {movie_dir}/ ({count:,} files)")


def export_stats(conn: sqlite3.Connection):
    """Export site-wide statistics."""
    print("Exporting stats...")
    stats = {}

    cursor = conn.execute("SELECT COUNT(DISTINCT movie_id) FROM trailers")
    stats["movies_with_trailers"] = cursor.fetchone()[0]

    cursor = conn.execute("SELECT COUNT(*) FROM trailers WHERE is_available = 1")
    stats["total_trailers"] = cursor.fetchone()[0]

    cursor = conn.execute("SELECT COUNT(DISTINCT language) FROM trailers WHERE language IS NOT NULL")
    stats["languages"] = cursor.fetchone()[0]

    cursor = conn.execute(
        "SELECT trailer_type, COUNT(*) FROM trailers WHERE is_available = 1 GROUP BY trailer_type ORDER BY COUNT(*) DESC"
    )
    stats["by_type"] = {row[0]: row[1] for row in cursor.fetchall()}

    cursor = conn.execute(
        "SELECT language, COUNT(*) FROM trailers WHERE language IS NOT NULL AND is_available = 1 GROUP BY language ORDER BY COUNT(*) DESC"
    )
    stats["by_language"] = {row[0]: row[1] for row in cursor.fetchall()}

    # Series stats
    try:
        cursor = conn.execute("SELECT COUNT(DISTINCT series_id) FROM series_trailers WHERE is_available = 1")
        stats["series_with_trailers"] = cursor.fetchone()[0]
        cursor = conn.execute("SELECT COUNT(*) FROM series_trailers WHERE is_available = 1")
        stats["total_series_trailers"] = cursor.fetchone()[0]
    except Exception:
        stats["series_with_trailers"] = 0
        stats["total_series_trailers"] = 0

    # YouTube engagement stats (from Phase 3 enrichment)
    cursor = conn.execute("SELECT COALESCE(SUM(view_count), 0) FROM trailers WHERE view_count IS NOT NULL")
    stats["total_views"] = cursor.fetchone()[0]
    cursor = conn.execute("SELECT COALESCE(SUM(like_count), 0) FROM trailers WHERE like_count IS NOT NULL")
    stats["total_likes"] = cursor.fetchone()[0]
    cursor = conn.execute("SELECT CAST(AVG(duration_seconds) AS INT) FROM trailers WHERE duration_seconds IS NOT NULL")
    stats["avg_duration_seconds"] = cursor.fetchone()[0] or 0
    cursor = conn.execute("SELECT COUNT(DISTINCT channel_name) FROM trailers WHERE channel_name IS NOT NULL")
    stats["unique_channels"] = cursor.fetchone()[0]

    # Top channels by trailer count
    cursor = conn.execute("""
        SELECT channel_name, COUNT(*) as cnt, COALESCE(SUM(view_count), 0) as total_views
        FROM trailers WHERE channel_name IS NOT NULL AND is_available = 1
        GROUP BY channel_name ORDER BY cnt DESC LIMIT 20
    """)
    stats["top_channels"] = [{"name": r[0], "trailers": r[1], "views": r[2]} for r in cursor.fetchall()]

    # Most viewed trailers
    cursor = conn.execute("""
        SELECT t.youtube_id, t.title, t.view_count, t.trailer_type, m.title as movie_title, m.imdb_id
        FROM trailers t JOIN movies m ON m.id = t.movie_id
        WHERE t.view_count IS NOT NULL AND t.is_available = 1
        ORDER BY t.view_count DESC LIMIT 20
    """)
    stats["most_viewed"] = [
        {"youtube_id": r[0], "title": r[1], "views": r[2], "type": r[3], "movie": r[4], "imdb_id": r[5]}
        for r in cursor.fetchall()
    ]

    # Average duration by type
    cursor = conn.execute("""
        SELECT trailer_type, CAST(AVG(duration_seconds) AS INT) as avg_dur, COUNT(*) as cnt
        FROM trailers WHERE duration_seconds IS NOT NULL AND is_available = 1
        GROUP BY trailer_type ORDER BY cnt DESC
    """)
    stats["duration_by_type"] = {r[0]: {"avg_seconds": r[1], "count": r[2]} for r in cursor.fetchall()}

    output = OUTPUT_DIR / "stats.json"
    output.write_text(json.dumps(stats, separators=(",", ":")))
    print(f"  → {output}")


def export_channels(conn: sqlite3.Connection):
    """Export channel intelligence data."""
    print("Exporting channel data...")
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    cursor = conn.execute("""
        SELECT t.channel_id, t.channel_name,
               COUNT(*) AS trailer_count,
               COUNT(DISTINCT t.movie_id) AS movie_count
        FROM trailers t
        WHERE t.channel_id IS NOT NULL AND t.channel_name IS NOT NULL
        GROUP BY t.channel_id
        HAVING COUNT(*) >= 5
        ORDER BY trailer_count DESC
    """)
    channels_raw = cursor.fetchall()

    channels = []
    for ch in channels_raw:
        channel_id, channel_name, trailer_count, movie_count = ch
        top_cursor = conn.execute("""
            SELECT m.imdb_id
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            WHERE t.channel_id = ?
            GROUP BY m.imdb_id
            ORDER BY m.imdb_votes DESC
            LIMIT 3
        """, (channel_id,))
        top_movies = [row[0] for row in top_cursor.fetchall()]

        channels.append({
            "channel_id": channel_id,
            "channel_name": channel_name,
            "trailer_count": trailer_count,
            "movie_count": movie_count,
            "top_movies": top_movies,
        })

    output = browse_dir / "channels.json"
    output.write_text(json.dumps(channels, separators=(",", ":")), encoding="utf-8")
    print(f"  → {output} ({len(channels):,} channels)")


def export_timeline_stats(conn: sqlite3.Connection):
    """Export aggregate timeline statistics."""
    print("Exporting timeline stats...")

    # Check if analytics columns exist
    try:
        conn.execute("SELECT days_before_release FROM trailers LIMIT 1")
    except sqlite3.OperationalError:
        print("  → Skipped (analytics columns not yet created)")
        return

    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    # Gather all days_before_release values
    cursor = conn.execute("""
        SELECT t.days_before_release, t.trailer_type, m.year
        FROM trailers t
        JOIN movies m ON m.id = t.movie_id
        WHERE t.days_before_release IS NOT NULL
          AND t.days_before_release >= 0
          AND t.days_before_release <= 1500
    """)
    rows = cursor.fetchall()

    if not rows:
        print("  → Skipped (no timeline data)")
        return

    all_days = [r[0] for r in rows]

    # By decade
    by_decade: dict[str, list[int]] = {}
    for days, ttype, year in rows:
        if year:
            decade = f"{(year // 10) * 10}s"
            by_decade.setdefault(decade, []).append(days)

    # By type
    by_type: dict[str, list[int]] = {}
    for days, ttype, year in rows:
        if ttype:
            by_type.setdefault(ttype, []).append(days)

    stats = {
        "avg_days_before_release": round(statistics.mean(all_days)),
        "median_days_before_release": round(statistics.median(all_days)),
        "by_decade": {k: round(statistics.mean(v)) for k, v in sorted(by_decade.items())},
        "by_type": {k: round(statistics.mean(v)) for k, v in sorted(by_type.items())},
    }

    output = browse_dir / "timeline-stats.json"
    output.write_text(json.dumps(stats, separators=(",", ":")), encoding="utf-8")
    print(f"  → {output}")


def make_series_slug(name: str, tmdb_id: int) -> str:
    """Generate a unique URL slug for a series."""
    parts = [slugify(name)]
    parts.append(str(tmdb_id))
    return "-".join(parts)


def get_series_genres(conn: sqlite3.Connection) -> dict[int, list[int]]:
    """Get genre IDs per series."""
    cursor = conn.execute("SELECT series_id, genre_id FROM series_genres")
    result: dict[int, list[int]] = {}
    for series_id, genre_id in cursor.fetchall():
        result.setdefault(series_id, []).append(genre_id)
    return result


def get_series_trailer_counts(conn: sqlite3.Connection) -> dict[int, int]:
    """Get trailer count per series."""
    cursor = conn.execute("SELECT series_id, COUNT(*) FROM series_trailers GROUP BY series_id")
    return {row[0]: row[1] for row in cursor.fetchall()}


def export_series_index(conn: sqlite3.Connection, genre_map: dict, series_genres: dict, trailer_counts: dict):
    """Export the compact series browse index."""
    print("Exporting series index...")
    cursor = conn.execute("""
        SELECT s.id, s.tmdb_id, s.name, s.first_air_date, s.vote_average, s.vote_count,
               s.poster_path, s.popularity
        FROM series s
        WHERE s.id IN (SELECT DISTINCT series_id FROM series_trailers)
        ORDER BY s.vote_count DESC
    """)

    series_list = []
    for row in cursor.fetchall():
        sid, tmdb_id, name, first_air_date, vote_avg, vote_count, poster, popularity = row
        # Extract year from first_air_date
        year = None
        if first_air_date and len(first_air_date) >= 4:
            try:
                year = int(first_air_date[:4])
            except ValueError:
                pass
        slug = make_series_slug(name, tmdb_id)
        genres = series_genres.get(sid, [])
        count = trailer_counts.get(sid, 0)

        series_list.append([
            tmdb_id, name, year, vote_avg, vote_count,
            poster, genres, slug, count, popularity or 0
        ])

    index = {
        "series": series_list,
        "fields": [
            "tmdb_id", "name", "year", "rating", "votes",
            "poster", "genre_ids", "slug", "trailer_count", "popularity"
        ],
        "genres": {str(k): v for k, v in genre_map.items()},
    }

    output = OUTPUT_DIR / "series-index.json"
    output.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"  → {output} ({len(series_list):,} series, {output.stat().st_size / 1024 / 1024:.1f} MB)")
    return series_list


def export_series_details(conn: sqlite3.Connection, series_list: list, genre_map: dict, series_genres: dict):
    """Export individual series detail files."""
    print("Exporting series detail files...")
    series_dir = OUTPUT_DIR / "series"
    series_dir.mkdir(parents=True, exist_ok=True)

    # Fetch all series details
    cursor = conn.execute("""
        SELECT id, tmdb_id, name, original_name, first_air_date, overview,
               poster_path, backdrop_path, status, number_of_seasons,
               vote_average, vote_count, original_language
        FROM series
        WHERE id IN (SELECT DISTINCT series_id FROM series_trailers)
    """)

    series_rows = {row[0]: row for row in cursor.fetchall()}

    # Fetch all series trailers
    trailer_cursor = conn.execute("""
        SELECT series_id, youtube_id, title, trailer_type, language, region,
               is_official, published_at, quality
        FROM series_trailers
        WHERE is_available = 1
        ORDER BY series_id,
                 CASE trailer_type
                     WHEN 'trailer' THEN 0 WHEN 'teaser' THEN 1 WHEN 'tv_spot' THEN 2
                     WHEN 'red_band' THEN 3 WHEN 'imax' THEN 4 WHEN 'clip' THEN 5
                     WHEN 'featurette' THEN 6 WHEN 'behind_the_scenes' THEN 7
                     WHEN 'bloopers' THEN 8 ELSE 9
                 END,
                 is_official DESC,
                 published_at DESC
    """)

    trailers_by_series: dict[int, list] = {}
    for row in trailer_cursor.fetchall():
        sid = row[0]
        trailer_obj = {
            "youtube_id": row[1],
            "title": row[2],
            "trailer_type": row[3],
            "language": row[4],
            "region": row[5],
            "is_official": bool(row[6]),
            "published_at": row[7],
            "quality": row[8],
        }
        trailers_by_series.setdefault(sid, []).append(trailer_obj)

    count = 0
    for sid, row in series_rows.items():
        _, tmdb_id, name, orig_name, first_air_date, overview, \
            poster, backdrop, status, num_seasons, vote_avg, vote_count, orig_lang = row

        slug = make_series_slug(name, tmdb_id)
        genres_list = [genre_map[gid] for gid in series_genres.get(sid, []) if gid in genre_map]
        trailers = trailers_by_series.get(sid, [])

        detail = {
            "tmdb_id": tmdb_id,
            "name": name,
            "original_name": orig_name,
            "first_air_date": first_air_date,
            "overview": overview,
            "poster_path": poster,
            "backdrop_path": backdrop,
            "status": status,
            "number_of_seasons": num_seasons,
            "vote_average": vote_avg,
            "vote_count": vote_count,
            "original_language": orig_lang,
            "genres": genres_list,
            "slug": slug,
            "trailers": trailers,
        }

        filepath = series_dir / f"{tmdb_id}.json"
        filepath.write_text(json.dumps(detail, separators=(",", ":")), encoding="utf-8")
        count += 1

        if count % 10000 == 0:
            print(f"  → {count:,} series files written...")

    print(f"  → {series_dir}/ ({count:,} files)")


def export_series_browse_shards(series_list: list):
    """Export pre-sorted series browse shards."""
    print("Exporting series browse shards...")
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    # Fields: tmdb_id=0, name=1, year=2, rating=3, votes=4, poster=5, genres=6, slug=7, count=8, popularity=9

    # Trending (top 100 by popularity)
    trending = sorted(series_list, key=lambda s: s[9] or 0, reverse=True)[:100]
    (browse_dir / "series-trending.json").write_text(json.dumps(trending, separators=(",", ":")))

    # Top rated (top 100 by vote_average, min 1000 votes)
    top_rated = sorted(
        [s for s in series_list if (s[4] or 0) >= 1000],
        key=lambda s: s[3] or 0, reverse=True
    )[:100]
    (browse_dir / "series-top-rated.json").write_text(json.dumps(top_rated, separators=(",", ":")))

    print(f"  → {browse_dir}/ (series shards created)")


def export_sitemaps(movies: list, domain: str = "trailerdb.com"):
    """Generate sitemap index and chunked sitemaps."""
    print("Generating sitemaps...")

    # Static pages
    static_urls = [
        f"https://{domain}/",
        f"https://{domain}/browse",
        f"https://{domain}/search",
        f"https://{domain}/about",
    ]

    # Movie URLs
    movie_urls = [f"https://{domain}/movie/{m[8]}" for m in movies]
    all_urls = static_urls + movie_urls

    # Chunk into sitemaps of 40K each
    chunk_size = 40000
    sitemap_files = []

    for i in range(0, len(all_urls), chunk_size):
        chunk = all_urls[i:i + chunk_size]
        idx = i // chunk_size + 1
        filename = f"sitemap-{idx}.xml"
        sitemap_files.append(filename)

        lines = ['<?xml version="1.0" encoding="UTF-8"?>']
        lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
        for url in chunk:
            lines.append(f"  <url><loc>{url}</loc></url>")
        lines.append("</urlset>")

        (SITEMAP_DIR / filename).write_text("\n".join(lines), encoding="utf-8")

    # Sitemap index
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for f in sitemap_files:
        lines.append(f"  <sitemap><loc>https://{domain}/{f}</loc></sitemap>")
    lines.append("</sitemapindex>")

    (SITEMAP_DIR / "sitemap-index.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  → {len(sitemap_files)} sitemap files, {len(all_urls):,} URLs")


def main():
    print(f"=== TrailerDB JSON Export ===")
    print(f"Database: {DB_PATH}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    # Clean output directory
    if OUTPUT_DIR.exists():
        import shutil
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    conn = sqlite3.connect(str(DB_PATH))

    # Gather shared data
    genre_map = get_genre_map(conn)
    movie_genres = get_movie_genres(conn)
    trailer_counts = get_movie_trailer_counts(conn)

    # Export all tiers — movies
    movies = export_index(conn, genre_map, movie_genres, trailer_counts)
    export_browse_shards(movies, genre_map)
    export_movie_details(conn, movies, genre_map, movie_genres)
    export_stats(conn)
    export_channels(conn)
    export_timeline_stats(conn)
    export_sitemaps(movies)

    # Export series
    s_genres = get_series_genres(conn)
    s_trailer_counts = get_series_trailer_counts(conn)
    series_list = export_series_index(conn, genre_map, s_genres, s_trailer_counts)
    export_series_details(conn, series_list, genre_map, s_genres)
    export_series_browse_shards(series_list)

    conn.close()
    print()
    print("=== Export complete ===")


if __name__ == "__main__":
    main()
