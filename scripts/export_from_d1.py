"""Export static JSON files from Cloudflare D1.

Queries D1 for aggregate data and writes the small JSON files that
power the TrailerDB frontend. This does NOT export individual
movie/series JSON files (those are handled by daily_update_d1.py
when new movies are added).

Exports:
  - stats.json
  - trending.json
  - analytics.json
  - browse shards (trending, top-rated, most-trailers, recent, genres, years, decades)

Usage:
    python scripts/export_from_d1.py

Environment variables:
    CF_API_TOKEN     — Cloudflare API token with D1 read access
    CF_ACCOUNT_ID    — Cloudflare account ID
    D1_DATABASE_ID   — Cloudflare D1 database ID
"""

import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "site" / "public" / "data"


# ---------------------------------------------------------------------------
# D1 helpers
# ---------------------------------------------------------------------------

def d1_query(sql: str) -> list[dict]:
    """Execute a SELECT query against D1 and return rows as dicts."""
    resp = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw",
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"sql": sql},
        timeout=60,
    )
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 query error: {data.get('errors')} — SQL: {sql[:200]}")
    results = data.get("result", [])
    if results and "results" in results[0]:
        inner = results[0]["results"]
        columns = inner.get("columns", [])
        rows = inner.get("rows", [])
        return [dict(zip(columns, row)) for row in rows]
    return []


# ---------------------------------------------------------------------------
# Slug helpers
# ---------------------------------------------------------------------------

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


def make_series_slug(name: str, tmdb_id: int) -> str:
    """Generate a unique URL slug for a series."""
    return f"{slugify(name)}-{tmdb_id}"


# ---------------------------------------------------------------------------
# Export functions
# ---------------------------------------------------------------------------

def export_stats():
    """Query D1 for aggregate stats and write stats.json."""
    print("Exporting stats.json...")
    stats = {}

    rows = d1_query("SELECT COUNT(DISTINCT movie_id) AS cnt FROM trailers")
    stats["movies_with_trailers"] = rows[0]["cnt"] if rows else 0

    rows = d1_query("SELECT COUNT(*) AS cnt FROM trailers WHERE is_available = 1")
    stats["total_trailers"] = rows[0]["cnt"] if rows else 0

    rows = d1_query("SELECT COUNT(DISTINCT language) AS cnt FROM trailers WHERE language IS NOT NULL")
    stats["languages"] = rows[0]["cnt"] if rows else 0

    rows = d1_query(
        "SELECT trailer_type, COUNT(*) AS cnt FROM trailers "
        "WHERE is_available = 1 GROUP BY trailer_type ORDER BY cnt DESC"
    )
    stats["by_type"] = {r["trailer_type"]: r["cnt"] for r in rows}

    rows = d1_query(
        "SELECT language, COUNT(*) AS cnt FROM trailers "
        "WHERE language IS NOT NULL AND is_available = 1 "
        "GROUP BY language ORDER BY cnt DESC"
    )
    stats["by_language"] = {r["language"]: r["cnt"] for r in rows}

    # Series stats
    try:
        rows = d1_query("SELECT COUNT(DISTINCT series_id) AS cnt FROM series_trailers WHERE is_available = 1")
        stats["series_with_trailers"] = rows[0]["cnt"] if rows else 0
        rows = d1_query("SELECT COUNT(*) AS cnt FROM series_trailers WHERE is_available = 1")
        stats["total_series_trailers"] = rows[0]["cnt"] if rows else 0
    except RuntimeError:
        stats["series_with_trailers"] = 0
        stats["total_series_trailers"] = 0

    # YouTube engagement stats
    rows = d1_query("SELECT COALESCE(SUM(view_count), 0) AS v FROM trailers WHERE view_count IS NOT NULL")
    stats["total_views"] = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COALESCE(SUM(like_count), 0) AS v FROM trailers WHERE like_count IS NOT NULL")
    stats["total_likes"] = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT CAST(AVG(duration_seconds) AS INTEGER) AS v FROM trailers WHERE duration_seconds IS NOT NULL")
    stats["avg_duration_seconds"] = rows[0]["v"] if rows and rows[0]["v"] else 0
    rows = d1_query("SELECT COUNT(DISTINCT channel_name) AS v FROM trailers WHERE channel_name IS NOT NULL")
    stats["unique_channels"] = rows[0]["v"] if rows else 0

    # Top channels
    rows = d1_query(
        "SELECT channel_name, COUNT(*) AS cnt, COALESCE(SUM(view_count), 0) AS total_views "
        "FROM trailers WHERE channel_name IS NOT NULL AND is_available = 1 "
        "GROUP BY channel_name ORDER BY cnt DESC LIMIT 20"
    )
    stats["top_channels"] = [
        {"name": r["channel_name"], "trailers": r["cnt"], "views": r["total_views"]}
        for r in rows
    ]

    # Most viewed trailers
    rows = d1_query(
        "SELECT t.youtube_id, t.title, t.view_count, t.trailer_type, m.title AS movie_title, m.imdb_id "
        "FROM trailers t JOIN movies m ON m.id = t.movie_id "
        "WHERE t.view_count IS NOT NULL AND t.is_available = 1 "
        "ORDER BY t.view_count DESC LIMIT 20"
    )
    stats["most_viewed"] = [
        {"youtube_id": r["youtube_id"], "title": r["title"], "views": r["view_count"],
         "type": r["trailer_type"], "movie": r["movie_title"], "imdb_id": r["imdb_id"]}
        for r in rows
    ]

    # Duration by type
    rows = d1_query(
        "SELECT trailer_type, CAST(AVG(duration_seconds) AS INTEGER) AS avg_dur, COUNT(*) AS cnt "
        "FROM trailers WHERE duration_seconds IS NOT NULL AND is_available = 1 "
        "GROUP BY trailer_type ORDER BY cnt DESC"
    )
    stats["duration_by_type"] = {
        r["trailer_type"]: {"avg_seconds": r["avg_dur"], "count": r["cnt"]}
        for r in rows
    }

    output = OUTPUT_DIR / "stats.json"
    output.write_text(json.dumps(stats, separators=(",", ":")), encoding="utf-8")
    print(f"  -> {output}")


def export_trending():
    """Query D1 for trending trailers and write trending.json."""
    print("Exporting trending.json...")

    rows = d1_query(
        "SELECT t.youtube_id, m.imdb_id, m.title AS movie_title, t.title AS trailer_title, "
        "m.year, m.poster_path, t.trailer_type, t.language, t.view_count, "
        "t.published_at, t.channel_name, "
        "CAST(julianday('now') - julianday(t.published_at) AS INTEGER) AS days_old "
        "FROM trailers t "
        "JOIN movies m ON m.id = t.movie_id "
        "WHERE t.is_available = 1 AND t.view_count IS NOT NULL AND t.published_at IS NOT NULL "
        "AND t.published_at > date('now', '-365 days') "
        "ORDER BY CAST(t.view_count AS REAL) / MAX(CAST(julianday('now') - julianday(t.published_at) AS INTEGER), 1) DESC "
        "LIMIT 200"
    )

    trending = []
    for r in rows:
        days = max(r.get("days_old") or 0, 1)
        views = r.get("view_count") or 0
        velocity = int(views / days)
        trending.append({
            "youtube_id": r["youtube_id"],
            "imdb_id": r["imdb_id"],
            "movie": r["movie_title"],
            "trailer": r["trailer_title"],
            "year": r["year"],
            "poster": r["poster_path"],
            "type": r["trailer_type"],
            "lang": r["language"],
            "views": views,
            "days_old": r["days_old"],
            "velocity": velocity,
            "channel": r["channel_name"],
        })

    output = OUTPUT_DIR / "trending.json"
    output.write_text(json.dumps(trending, separators=(",", ":")), encoding="utf-8")
    print(f"  -> {output} ({len(trending)} trailers)")


def export_analytics():
    """Query D1 for analytics aggregates and write analytics.json."""
    print("Exporting analytics.json...")
    analytics = {}

    # 1. Overview
    rows = d1_query("SELECT COUNT(DISTINCT movie_id) AS v FROM trailers WHERE is_available=1")
    movies_count = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COUNT(DISTINCT series_id) AS v FROM series_trailers WHERE is_available=1")
    series_count = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COUNT(*) AS v FROM trailers WHERE is_available=1")
    trailers_count = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COUNT(*) AS v FROM series_trailers WHERE is_available=1")
    series_trailers_count = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COALESCE(SUM(view_count), 0) AS v FROM trailers WHERE is_available=1 AND view_count IS NOT NULL")
    total_views = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COALESCE(SUM(like_count), 0) AS v FROM trailers WHERE is_available=1 AND like_count IS NOT NULL")
    total_likes = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT COUNT(DISTINCT channel_name) AS v FROM trailers WHERE channel_name IS NOT NULL AND is_available=1")
    unique_channels = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT CAST(COALESCE(AVG(duration_seconds), 0) AS INTEGER) AS v FROM trailers WHERE duration_seconds IS NOT NULL AND is_available=1")
    avg_duration = rows[0]["v"] if rows else 0
    rows = d1_query("SELECT CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS v FROM trailers WHERE view_count IS NOT NULL AND is_available=1")
    avg_views_per_trailer = rows[0]["v"] if rows else 0
    engagement_rate = round(total_likes / total_views * 100, 2) if total_views > 0 else 0

    analytics["overview"] = {
        "movies": movies_count,
        "series": series_count,
        "trailers": trailers_count,
        "series_trailers": series_trailers_count,
        "total_views": total_views,
        "total_likes": total_likes,
        "unique_channels": unique_channels,
        "avg_duration": avg_duration,
        "avg_views_per_trailer": avg_views_per_trailer,
        "engagement_rate": engagement_rate,
    }

    # 2. by_type
    rows = d1_query(
        "SELECT trailer_type, COUNT(*) AS cnt, "
        "CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS avg_views, "
        "COALESCE(MAX(view_count), 0) AS max_views, "
        "CAST(COALESCE(AVG(duration_seconds), 0) AS INTEGER) AS avg_duration, "
        "COALESCE(SUM(view_count), 0) AS total_views, "
        "COALESCE(SUM(like_count), 0) AS total_likes, "
        "CAST(COALESCE(AVG(like_count), 0) AS INTEGER) AS avg_likes "
        "FROM trailers WHERE is_available=1 AND view_count IS NOT NULL "
        "GROUP BY trailer_type ORDER BY avg_views DESC"
    )
    by_type = []
    for r in rows:
        tot_v = r["total_views"] or 0
        tot_l = r["total_likes"] or 0
        avg_dur = r["avg_duration"] or 0
        cnt = r["cnt"] or 0
        likes_per_1k = round(tot_l / tot_v * 1000, 2) if tot_v > 0 else 0
        views_per_sec = round(tot_v / (avg_dur * cnt), 2) if avg_dur > 0 and cnt > 0 else 0
        by_type.append({
            "type": r["trailer_type"], "count": cnt, "avg_views": r["avg_views"],
            "max_views": r["max_views"], "avg_duration": avg_dur,
            "total_views": tot_v, "total_likes": tot_l, "avg_likes": r["avg_likes"],
            "likes_per_1k_views": likes_per_1k, "views_per_second": views_per_sec,
        })
    analytics["by_type"] = by_type

    # 3. by_language
    rows = d1_query(
        "SELECT language, COUNT(*) AS cnt, "
        "COALESCE(SUM(view_count), 0) AS total_views, "
        "CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS avg_views, "
        "COALESCE(SUM(like_count), 0) AS total_likes, "
        "CAST(COALESCE(AVG(like_count), 0) AS INTEGER) AS avg_likes "
        "FROM trailers "
        "WHERE language IS NOT NULL AND view_count IS NOT NULL AND is_available=1 "
        "GROUP BY language ORDER BY AVG(view_count) DESC"
    )
    analytics["by_language"] = [
        {"lang": r["language"], "count": r["cnt"], "total_views": r["total_views"],
         "avg_views": r["avg_views"], "total_likes": r["total_likes"], "avg_likes": r["avg_likes"]}
        for r in rows
    ]

    # 4. by_year (2000+)
    rows = d1_query(
        "SELECT m.year, COUNT(DISTINCT m.id) AS movies, COUNT(t.id) AS trailers, "
        "COALESCE(SUM(t.view_count), 0) AS total_views, "
        "CAST(COALESCE(AVG(t.view_count), 0) AS INTEGER) AS avg_views "
        "FROM trailers t JOIN movies m ON m.id = t.movie_id "
        "WHERE m.year >= 2000 AND m.year <= 2027 AND t.is_available=1 "
        "GROUP BY m.year ORDER BY m.year"
    )
    analytics["by_year"] = [
        {"year": r["year"], "movies": r["movies"], "trailers": r["trailers"],
         "total_views": r["total_views"], "avg_views": r["avg_views"]}
        for r in rows
    ]

    # 5. top_channels_by_views
    rows = d1_query(
        "SELECT channel_name, COUNT(*) AS trailers, "
        "COALESCE(SUM(view_count), 0) AS views, "
        "CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS avg_per_trailer "
        "FROM trailers "
        "WHERE channel_name IS NOT NULL AND is_available=1 AND view_count IS NOT NULL "
        "GROUP BY channel_name ORDER BY SUM(view_count) DESC LIMIT 30"
    )
    analytics["top_channels_by_views"] = [
        {"name": r["channel_name"], "trailers": r["trailers"],
         "views": r["views"], "avg_per_trailer": r["avg_per_trailer"]}
        for r in rows
    ]

    # 6. top_channels_by_count
    rows = d1_query(
        "SELECT channel_name, COUNT(*) AS trailers, "
        "COALESCE(SUM(view_count), 0) AS views, "
        "CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS avg_per_trailer "
        "FROM trailers "
        "WHERE channel_name IS NOT NULL AND is_available=1 "
        "GROUP BY channel_name ORDER BY COUNT(*) DESC LIMIT 30"
    )
    analytics["top_channels_by_count"] = [
        {"name": r["channel_name"], "trailers": r["trailers"],
         "views": r["views"], "avg_per_trailer": r["avg_per_trailer"]}
        for r in rows
    ]

    # 7. most_viewed
    rows = d1_query(
        "SELECT t.youtube_id, t.title, t.view_count, COALESCE(t.like_count, 0) AS likes, "
        "t.trailer_type, COALESCE(t.duration_seconds, 0) AS duration, "
        "COALESCE(t.channel_name, '') AS channel, "
        "m.title AS movie_title, m.imdb_id, m.year "
        "FROM trailers t JOIN movies m ON m.id = t.movie_id "
        "WHERE t.view_count IS NOT NULL AND t.is_available=1 "
        "ORDER BY t.view_count DESC LIMIT 50"
    )
    analytics["most_viewed"] = [
        {"youtube_id": r["youtube_id"], "title": r["title"], "views": r["view_count"],
         "likes": r["likes"], "type": r["trailer_type"], "duration": r["duration"],
         "channel": r["channel"], "movie": r["movie_title"], "imdb_id": r["imdb_id"],
         "year": r["year"]}
        for r in rows
    ]

    # 8. overperformers
    rows = d1_query(
        "SELECT trailer_type, AVG(view_count) AS avg_v "
        "FROM trailers WHERE is_available=1 AND view_count IS NOT NULL "
        "GROUP BY trailer_type"
    )
    type_avgs = {r["trailer_type"]: r["avg_v"] for r in rows if r["avg_v"]}

    if type_avgs:
        case_parts = " ".join(
            f"WHEN '{ttype}' THEN {avg}" for ttype, avg in type_avgs.items()
        )
        case_expr = f"CASE t.trailer_type {case_parts} ELSE 0 END"
        rows = d1_query(
            f"SELECT t.youtube_id, m.title, m.imdb_id, t.view_count, t.trailer_type, "
            f"CAST({case_expr} AS INTEGER) AS type_avg, "
            f"CAST(t.view_count * 1.0 / (CASE {case_expr} WHEN 0 THEN 1 ELSE {case_expr} END) AS INTEGER) AS multiplier "
            f"FROM trailers t JOIN movies m ON m.id = t.movie_id "
            f"WHERE t.is_available=1 AND t.view_count IS NOT NULL "
            f"AND t.view_count > 10 * ({case_expr}) AND ({case_expr}) > 0 "
            f"ORDER BY multiplier DESC LIMIT 20"
        )
        analytics["overperformers"] = [
            {"youtube_id": r["youtube_id"], "movie": r["title"], "imdb_id": r["imdb_id"],
             "views": r["view_count"], "type": r["trailer_type"],
             "type_avg": r["type_avg"], "multiplier": r["multiplier"]}
            for r in rows
        ]
    else:
        analytics["overperformers"] = []

    # 9. multilingual_stats
    rows = d1_query(
        "SELECT COUNT(*) AS v FROM ("
        "SELECT movie_id FROM trailers "
        "WHERE is_available=1 AND language IS NOT NULL "
        "GROUP BY movie_id HAVING COUNT(DISTINCT language) > 1)"
    )
    movies_with_multiple_langs = rows[0]["v"] if rows else 0

    rows = d1_query(
        "SELECT CAST(COALESCE(AVG(lang_count), 0) AS INTEGER) AS v FROM ("
        "SELECT COUNT(DISTINCT language) AS lang_count "
        "FROM trailers WHERE is_available=1 AND language IS NOT NULL "
        "GROUP BY movie_id HAVING COUNT(DISTINCT language) > 1)"
    )
    avg_langs = rows[0]["v"] if rows else 0

    rows = d1_query(
        "SELECT l1.language || '-' || l2.language AS pair, COUNT(*) AS cnt "
        "FROM (SELECT DISTINCT movie_id, language FROM trailers WHERE is_available=1 AND language IS NOT NULL) l1 "
        "JOIN (SELECT DISTINCT movie_id, language FROM trailers WHERE is_available=1 AND language IS NOT NULL) l2 "
        "ON l1.movie_id = l2.movie_id AND l1.language < l2.language "
        "GROUP BY pair ORDER BY cnt DESC LIMIT 10"
    )
    top_lang_pairs = [{"pair": r["pair"], "count": r["cnt"]} for r in rows]

    analytics["multilingual_stats"] = {
        "movies_with_multiple_langs": movies_with_multiple_langs,
        "avg_langs": avg_langs,
        "top_lang_pairs": top_lang_pairs,
    }

    # 10. duration_heatmap
    rows = d1_query(
        "SELECT trailer_type, "
        "CASE "
        "WHEN duration_seconds <= 30 THEN '0-30s' "
        "WHEN duration_seconds <= 60 THEN '30-60s' "
        "WHEN duration_seconds <= 120 THEN '60-120s' "
        "WHEN duration_seconds <= 180 THEN '120-180s' "
        "WHEN duration_seconds <= 300 THEN '180-300s' "
        "ELSE '300+s' END AS bucket, "
        "CAST(COALESCE(AVG(view_count), 0) AS INTEGER) AS avg_views, "
        "COUNT(*) AS cnt "
        "FROM trailers "
        "WHERE is_available=1 AND duration_seconds IS NOT NULL AND view_count IS NOT NULL "
        "GROUP BY trailer_type, bucket ORDER BY trailer_type, bucket"
    )
    analytics["duration_heatmap"] = [
        {"type": r["trailer_type"], "bucket": r["bucket"],
         "avg_views": r["avg_views"], "count": r["cnt"]}
        for r in rows
    ]

    # 11. type_by_genre
    rows = d1_query(
        "SELECT g.name, t.trailer_type, COUNT(*) AS cnt "
        "FROM trailers t "
        "JOIN movies m ON m.id = t.movie_id "
        "JOIN movie_genres mg ON mg.movie_id = m.id "
        "JOIN genres g ON g.id = mg.genre_id "
        "WHERE t.is_available=1 "
        "GROUP BY g.name, t.trailer_type ORDER BY g.name, cnt DESC"
    )
    genre_totals: dict[str, int] = {}
    genre_types: dict[str, dict[str, int]] = {}
    for r in rows:
        genre = r["name"]
        ttype = r["trailer_type"]
        cnt = r["cnt"]
        genre_totals[genre] = genre_totals.get(genre, 0) + cnt
        genre_types.setdefault(genre, {})[ttype] = cnt

    top_genres = sorted(genre_totals, key=lambda g: genre_totals[g], reverse=True)[:10]
    analytics["type_by_genre"] = [
        {"genre": g, **genre_types[g]} for g in top_genres
    ]

    output = OUTPUT_DIR / "analytics.json"
    output.write_text(json.dumps(analytics, separators=(",", ":")), encoding="utf-8")
    print(f"  -> {output}")


def export_browse_shards():
    """Query D1 for browse shard data and write JSON files."""
    print("Exporting browse shards...")
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    # Build genre map
    genre_rows = d1_query("SELECT id, name FROM genres ORDER BY name")
    genre_map = {r["id"]: r["name"] for r in genre_rows}

    # Get movies with trailers
    print("  Fetching movie browse data...")
    movie_rows = d1_query(
        "SELECT m.id, m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes, "
        "m.poster_path, m.tmdb_id, m.tmdb_popularity "
        "FROM movies m "
        "WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers) "
        "ORDER BY m.imdb_votes DESC"
    )

    # Genre mappings
    mg_rows = d1_query("SELECT movie_id, genre_id FROM movie_genres")
    movie_genres: dict[int, list[int]] = {}
    for r in mg_rows:
        movie_genres.setdefault(r["movie_id"], []).append(r["genre_id"])

    # Trailer counts
    tc_rows = d1_query("SELECT movie_id, COUNT(*) AS cnt FROM trailers GROUP BY movie_id")
    trailer_counts = {r["movie_id"]: r["cnt"] for r in tc_rows}

    # Build compact movie arrays
    movies = []
    for row in movie_rows:
        mid = row["id"]
        imdb_id = row["imdb_id"]
        title = row["title"]
        year = row["year"]
        slug = make_slug(title, year, imdb_id)
        genres = movie_genres.get(mid, [])
        count = trailer_counts.get(mid, 0)
        movies.append([
            imdb_id, title, year, row["imdb_rating"], row["imdb_votes"],
            row["poster_path"], genres, row["tmdb_id"], slug, count,
            row["tmdb_popularity"] or 0,
        ])

    # Trending
    trending = sorted(movies, key=lambda m: m[10] or 0, reverse=True)[:100]
    (browse_dir / "trending.json").write_text(json.dumps(trending, separators=(",", ":")))

    # Top rated
    top_rated = sorted(
        [m for m in movies if (m[4] or 0) >= 10000],
        key=lambda m: m[3] or 0, reverse=True
    )[:100]
    (browse_dir / "top-rated.json").write_text(json.dumps(top_rated, separators=(",", ":")))

    # Most trailers
    most_trailers = sorted(movies, key=lambda m: m[9], reverse=True)[:100]
    (browse_dir / "most-trailers.json").write_text(json.dumps(most_trailers, separators=(",", ":")))

    # Recent
    recent = sorted(
        [m for m in movies if m[2] and m[2] >= 2020],
        key=lambda m: (m[2], m[4] or 0), reverse=True
    )[:200]
    (browse_dir / "recent.json").write_text(json.dumps(recent, separators=(",", ":")))

    # Genre metadata + per-genre shards
    genre_id_to_slug = {}
    genre_meta = []
    for gid, name in sorted(genre_map.items(), key=lambda x: x[1]):
        genre_slug = slugify(name)
        genre_id_to_slug[gid] = genre_slug
        count = len([m for m in movies if gid in m[6]])
        if count > 0:
            genre_meta.append({"id": gid, "name": name, "slug": genre_slug, "count": count})
    (browse_dir / "genres.json").write_text(json.dumps(genre_meta, separators=(",", ":")))

    genre_dir = browse_dir / "genre"
    genre_dir.mkdir(parents=True, exist_ok=True)
    for gid, name in genre_map.items():
        genre_slug = genre_id_to_slug.get(gid, slugify(name))
        genre_movies = sorted(
            [m for m in movies if gid in m[6]],
            key=lambda m: m[4] or 0, reverse=True
        )[:200]
        if genre_movies:
            (genre_dir / f"{genre_slug}.json").write_text(
                json.dumps(genre_movies, separators=(",", ":"))
            )

    # By year
    current_year = datetime.utcnow().year
    year_dir = browse_dir / "year"
    year_dir.mkdir(parents=True, exist_ok=True)
    for year in range(1920, current_year + 2):
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
            (decade_dir / f"{decade_start}s.json").write_text(
                json.dumps(decade_movies, separators=(",", ":"))
            )

    # --- Series shards ---
    print("  Fetching series browse data...")
    series_rows = d1_query(
        "SELECT s.id, s.tmdb_id, s.name, s.first_air_date, s.vote_average, s.vote_count, "
        "s.poster_path, s.popularity "
        "FROM series s "
        "WHERE s.id IN (SELECT DISTINCT series_id FROM series_trailers) "
        "ORDER BY s.vote_count DESC"
    )

    sg_rows = d1_query("SELECT series_id, genre_id FROM series_genres")
    series_genres: dict[int, list[int]] = {}
    for r in sg_rows:
        series_genres.setdefault(r["series_id"], []).append(r["genre_id"])

    stc_rows = d1_query("SELECT series_id, COUNT(*) AS cnt FROM series_trailers GROUP BY series_id")
    series_trailer_counts = {r["series_id"]: r["cnt"] for r in stc_rows}

    series_list = []
    for row in series_rows:
        sid = row["id"]
        tmdb_id = row["tmdb_id"]
        name = row["name"]
        first_air_date = row["first_air_date"]
        year = None
        if first_air_date and len(str(first_air_date)) >= 4:
            try:
                year = int(str(first_air_date)[:4])
            except ValueError:
                pass
        slug = make_series_slug(name, tmdb_id)
        genres = series_genres.get(sid, [])
        count = series_trailer_counts.get(sid, 0)
        series_list.append([
            tmdb_id, name, year, row["vote_average"], row["vote_count"],
            row["poster_path"], genres, slug, count, row["popularity"] or 0,
        ])

    # Series trending
    s_trending = sorted(series_list, key=lambda s: s[9] or 0, reverse=True)[:100]
    (browse_dir / "series-trending.json").write_text(json.dumps(s_trending, separators=(",", ":")))

    # Series top rated
    s_top_rated = sorted(
        [s for s in series_list if (s[4] or 0) >= 1000],
        key=lambda s: s[3] or 0, reverse=True
    )[:100]
    (browse_dir / "series-top-rated.json").write_text(json.dumps(s_top_rated, separators=(",", ":")))

    print(f"  -> {browse_dir}/ (shards written)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("TrailerDB JSON Export from D1")
    print("=" * 60)
    start_time = time.time()

    # Validate environment
    missing = []
    if not CF_API_TOKEN:
        missing.append("CF_API_TOKEN")
    if not CF_ACCOUNT_ID:
        missing.append("CF_ACCOUNT_ID")
    if not D1_DATABASE_ID:
        missing.append("D1_DATABASE_ID")

    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    # Test D1 connection
    print("\nTesting D1 connection...")
    try:
        rows = d1_query("SELECT COUNT(*) AS cnt FROM movies")
        print(f"  D1 connected — {rows[0]['cnt']:,} movies in database")
    except RuntimeError as e:
        print(f"ERROR: D1 connection failed: {e}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    export_stats()
    export_trending()
    export_analytics()
    export_browse_shards()

    elapsed = time.time() - start_time
    print(f"\nExport complete in {elapsed:.0f}s")


if __name__ == "__main__":
    main()
