"""Daily update script for TrailerDB using Cloudflare D1.

Downloads the latest TMDB daily exports, finds new movies and series,
fetches their trailers, inserts into D1, then re-exports JSON files.

Usage:
    python scripts/daily_update_d1.py

Environment variables:
    TMDB_API_KEY     — TMDB v3 API key
    CF_API_TOKEN     — Cloudflare API token with D1 write access
    CF_ACCOUNT_ID    — Cloudflare account ID
    D1_DATABASE_ID   — Cloudflare D1 database ID
"""

import gzip
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "")
CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_EXPORT_URL = "https://files.tmdb.org/p/exports"

MAX_NEW_MOVIES = 500
MAX_NEW_SERIES = 200
TOP_POPULAR_MOVIES = 100
CHUNK_SIZE = 25  # rows per D1 INSERT statement (stay under 100KB)

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "site" / "public" / "data"
DOWNLOAD_DIR = PROJECT_ROOT / "data"

# Trailer type classification (from pipeline/type_classifier.py)
_TV_SPOT = re.compile(r"\btv\s*spot\b", re.IGNORECASE)
_RED_BAND = re.compile(r"\bred\s*band\b", re.IGNORECASE)
_IMAX = re.compile(r"\bimax\b", re.IGNORECASE)
_TYPE_MAP = {
    "Trailer": "trailer",
    "Teaser": "teaser",
    "Clip": "clip",
    "Behind the Scenes": "behind_the_scenes",
    "Featurette": "featurette",
    "Bloopers": "bloopers",
    "Opening Credits": "opening_credits",
}


def classify_trailer_type(tmdb_type: str, name: str) -> str:
    """Classify a TMDB video into a trailer_type."""
    if tmdb_type == "Trailer":
        if _TV_SPOT.search(name):
            return "tv_spot"
        if _RED_BAND.search(name):
            return "red_band"
        if _IMAX.search(name):
            return "imax"
        return "trailer"
    return _TYPE_MAP.get(tmdb_type, "trailer")


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


def d1_exec(sql: str) -> bool:
    """Execute a write statement (INSERT/UPDATE) against D1."""
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
        raise RuntimeError(f"D1 exec error: {data.get('errors')} — SQL: {sql[:200]}")
    return True


def d1_batch(statements: list[str]) -> bool:
    """Execute multiple SQL statements in a single D1 batch request."""
    if not statements:
        return True
    # D1 batch endpoint accepts an array of {sql} objects
    resp = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw",
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        json=[{"sql": s} for s in statements],
        timeout=120,
    )
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 batch error: {data.get('errors')}")
    return True


def sql_escape(value) -> str:
    """Escape a value for safe SQL embedding."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    # String: escape single quotes
    s = str(value).replace("'", "''")
    return f"'{s}'"


# ---------------------------------------------------------------------------
# TMDB export download helpers
# ---------------------------------------------------------------------------

def download_export(prefix: str) -> Path | None:
    """Download a TMDB daily export file (tries today, then yesterday)."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    for offset in (0, 1):
        date_str = (datetime.utcnow() - timedelta(days=offset)).strftime("%m_%d_%Y")
        filename = f"{prefix}_{date_str}.json.gz"
        url = f"{TMDB_EXPORT_URL}/{filename}"
        dest = DOWNLOAD_DIR / filename

        if dest.exists():
            print(f"  Export already downloaded: {dest.name}")
            return dest

        print(f"  Downloading {url} ...")
        try:
            resp = requests.get(url, timeout=120)
            if resp.status_code == 200:
                dest.write_bytes(resp.content)
                print(f"  Downloaded {dest.name} ({len(resp.content):,} bytes)")
                return dest
            print(f"  HTTP {resp.status_code} for {url}")
        except requests.RequestException as e:
            print(f"  Download failed: {e}")

    print(f"  Could not download TMDB export for prefix '{prefix}'")
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
# TMDB API helpers
# ---------------------------------------------------------------------------

def tmdb_get(path: str, params: dict | None = None) -> dict | None:
    """Make a TMDB API request with simple rate limiting."""
    time.sleep(0.05)  # ~20 req/sec
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    url = f"{TMDB_BASE_URL}{path}"
    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 429:
            print("    Rate limited, sleeping 2s...")
            time.sleep(2)
            resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            print(f"    TMDB HTTP {resp.status_code} for {path}")
            return None
        return resp.json()
    except requests.RequestException as e:
        print(f"    TMDB request failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Slug helpers (matching export.py patterns)
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
# Step 1 + 2: Find and insert new movies
# ---------------------------------------------------------------------------

def get_existing_movie_tmdb_ids() -> set[int]:
    """Query D1 for all existing movie tmdb_ids."""
    print("  Querying D1 for existing movie tmdb_ids...")
    ids = set()
    offset = 0
    batch_size = 10000
    while True:
        rows = d1_query(
            f"SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL "
            f"LIMIT {batch_size} OFFSET {offset}"
        )
        if not rows:
            break
        for row in rows:
            ids.add(int(row["tmdb_id"]))
        if len(rows) < batch_size:
            break
        offset += batch_size
    print(f"  Found {len(ids):,} existing movie tmdb_ids in D1")
    return ids


def insert_movie_to_d1(data: dict) -> int | None:
    """Insert a single movie into D1. Returns the movie's D1 id or None."""
    imdb_id = data.get("imdb_id")
    if not imdb_id:
        return None

    tmdb_id = data.get("id")
    title = data.get("title", "Unknown")
    release_date = data.get("release_date")
    year = None
    if release_date and len(release_date) >= 4:
        try:
            year = int(release_date[:4])
        except ValueError:
            pass

    sql = (
        "INSERT OR IGNORE INTO movies "
        "(imdb_id, tmdb_id, title, original_title, year, tmdb_popularity, "
        "poster_path, backdrop_path, overview, runtime, original_language, release_date) "
        f"VALUES ({sql_escape(imdb_id)}, {sql_escape(tmdb_id)}, {sql_escape(title)}, "
        f"{sql_escape(data.get('original_title'))}, {sql_escape(year)}, "
        f"{sql_escape(data.get('popularity'))}, {sql_escape(data.get('poster_path'))}, "
        f"{sql_escape(data.get('backdrop_path'))}, {sql_escape(data.get('overview'))}, "
        f"{sql_escape(data.get('runtime'))}, {sql_escape(data.get('original_language'))}, "
        f"{sql_escape(release_date)})"
    )
    try:
        d1_exec(sql)
    except RuntimeError as e:
        print(f"    Failed to insert movie {imdb_id}: {e}")
        return None

    # Get the movie's internal id
    rows = d1_query(f"SELECT id FROM movies WHERE imdb_id = {sql_escape(imdb_id)}")
    if not rows:
        return None
    return int(rows[0]["id"])


def insert_genres_to_d1(movie_id: int, genres: list[dict]):
    """Insert genres and movie_genres relationships."""
    if not genres:
        return
    statements = []
    for genre in genres:
        gid = genre.get("id")
        gname = genre.get("name")
        if gid and gname:
            statements.append(
                f"INSERT OR IGNORE INTO genres (id, name) VALUES ({sql_escape(gid)}, {sql_escape(gname)})"
            )
            statements.append(
                f"INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES ({movie_id}, {gid})"
            )
    if statements:
        # Batch in chunks to stay under D1 limits
        for i in range(0, len(statements), 20):
            chunk = statements[i:i + 20]
            try:
                d1_batch(chunk)
            except RuntimeError as e:
                print(f"    Genre insert error: {e}")


def insert_trailers_to_d1(movie_id: int, videos: list[dict]) -> int:
    """Insert YouTube trailers for a movie into D1. Returns count inserted."""
    youtube_videos = [v for v in videos if v.get("site") == "YouTube"]
    if not youtube_videos:
        return 0

    count = 0
    statements = []
    for video in youtube_videos:
        trailer_type = classify_trailer_type(
            video.get("type", ""), video.get("name", "")
        )
        sql = (
            "INSERT OR IGNORE INTO trailers "
            "(movie_id, youtube_id, title, trailer_type, language, region, "
            "is_official, quality, published_at, source) "
            f"VALUES ({movie_id}, {sql_escape(video['key'])}, "
            f"{sql_escape(video.get('name'))}, {sql_escape(trailer_type)}, "
            f"{sql_escape(video.get('iso_639_1'))}, {sql_escape(video.get('iso_3166_1'))}, "
            f"{1 if video.get('official', True) else 0}, "
            f"{sql_escape(video.get('size'))}, "
            f"{sql_escape(video.get('published_at'))}, 'tmdb')"
        )
        statements.append(sql)
        count += 1

    # Batch insert
    for i in range(0, len(statements), CHUNK_SIZE):
        chunk = statements[i:i + CHUNK_SIZE]
        try:
            d1_batch(chunk)
        except RuntimeError as e:
            print(f"    Trailer insert error: {e}")
            count -= len(chunk)  # approximate; some may have succeeded

    return count


def process_new_movies() -> tuple[int, int, list[dict]]:
    """Step 1+2: Find new movies from TMDB export and insert them.

    Returns (movies_added, trailers_added, new_movie_details).
    new_movie_details is a list of dicts for writing individual JSON files.
    """
    print("\n=== Step 1: Find new movies ===")
    export_path = download_export("movie_ids")
    if not export_path:
        print("  Skipping: export download failed")
        return 0, 0, []

    export_ids = parse_export_ids(export_path)
    print(f"  TMDB export contains {len(export_ids):,} movie IDs")

    existing_ids = get_existing_movie_tmdb_ids()
    new_ids = sorted(export_ids - existing_ids)
    print(f"  New movie IDs: {len(new_ids):,}")

    if not new_ids:
        print("  No new movies to process")
        return 0, 0, []

    # Cap at MAX_NEW_MOVIES newest IDs (higher TMDB ID = newer)
    if len(new_ids) > MAX_NEW_MOVIES:
        print(f"  Capping to {MAX_NEW_MOVIES} newest IDs")
        new_ids = new_ids[-MAX_NEW_MOVIES:]

    print(f"\n=== Step 2: Fetch and insert {len(new_ids)} new movies ===")
    movies_added = 0
    trailers_added = 0
    new_movie_details = []

    for i, tmdb_id in enumerate(new_ids):
        data = tmdb_get(f"/movie/{tmdb_id}", {
            "language": "en-US",
            "append_to_response": "videos",
        })
        if data is None:
            continue

        imdb_id = data.get("imdb_id")
        if not imdb_id:
            continue

        movie_id = insert_movie_to_d1(data)
        if movie_id is None:
            continue

        movies_added += 1

        # Genres
        insert_genres_to_d1(movie_id, data.get("genres", []))

        # Trailers
        videos = data.get("videos", {}).get("results", [])
        t_count = insert_trailers_to_d1(movie_id, videos)
        trailers_added += t_count

        # Collect detail for JSON export
        new_movie_details.append({
            "d1_id": movie_id,
            "tmdb_data": data,
            "trailers": [v for v in videos if v.get("site") == "YouTube"],
        })

        if (i + 1) % 50 == 0 or (i + 1) == len(new_ids):
            print(f"  Progress: {i + 1}/{len(new_ids)} — "
                  f"{movies_added} movies, {trailers_added} trailers")

    print(f"  Done: {movies_added} movies added, {trailers_added} trailers")
    return movies_added, trailers_added, new_movie_details


# ---------------------------------------------------------------------------
# Step 3: Refresh popular movies
# ---------------------------------------------------------------------------

def refresh_popular_movies() -> int:
    """Re-check top popular movies for new trailers. Returns trailers added."""
    print(f"\n=== Step 3: Refresh top {TOP_POPULAR_MOVIES} popular movies ===")

    rows = d1_query(
        f"SELECT id, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL "
        f"ORDER BY imdb_votes DESC LIMIT {TOP_POPULAR_MOVIES}"
    )
    if not rows:
        print("  No popular movies found in D1")
        return 0

    print(f"  Checking {len(rows)} popular movies...")
    trailers_added = 0

    for i, row in enumerate(rows):
        movie_id = int(row["id"])
        tmdb_id = int(row["tmdb_id"])

        data = tmdb_get(f"/movie/{tmdb_id}", {
            "language": "en-US",
            "append_to_response": "videos",
        })
        if data is None:
            continue

        videos = data.get("videos", {}).get("results", [])
        t_count = insert_trailers_to_d1(movie_id, videos)
        trailers_added += t_count

        if (i + 1) % 50 == 0 or (i + 1) == len(rows):
            print(f"  Progress: {i + 1}/{len(rows)} — {trailers_added} new trailers")

    print(f"  Done: {trailers_added} new trailers from popular movies")
    return trailers_added


# ---------------------------------------------------------------------------
# Step 4: New series
# ---------------------------------------------------------------------------

def get_existing_series_tmdb_ids() -> set[int]:
    """Query D1 for all existing series tmdb_ids."""
    print("  Querying D1 for existing series tmdb_ids...")
    ids = set()
    offset = 0
    batch_size = 10000
    while True:
        rows = d1_query(
            f"SELECT tmdb_id FROM series WHERE tmdb_id IS NOT NULL "
            f"LIMIT {batch_size} OFFSET {offset}"
        )
        if not rows:
            break
        for row in rows:
            ids.add(int(row["tmdb_id"]))
        if len(rows) < batch_size:
            break
        offset += batch_size
    print(f"  Found {len(ids):,} existing series tmdb_ids in D1")
    return ids


def insert_series_to_d1(data: dict) -> int | None:
    """Insert a single series into D1. Returns the series D1 id or None."""
    tmdb_id = data.get("id")
    name = data.get("name") or data.get("original_name") or f"Unknown Series {tmdb_id}"

    sql = (
        "INSERT OR IGNORE INTO series "
        "(tmdb_id, name, original_name, first_air_date, overview, "
        "poster_path, backdrop_path, status, number_of_seasons, "
        "vote_average, vote_count, popularity, original_language) "
        f"VALUES ({sql_escape(tmdb_id)}, {sql_escape(name)}, "
        f"{sql_escape(data.get('original_name'))}, {sql_escape(data.get('first_air_date'))}, "
        f"{sql_escape(data.get('overview'))}, {sql_escape(data.get('poster_path'))}, "
        f"{sql_escape(data.get('backdrop_path'))}, {sql_escape(data.get('status'))}, "
        f"{sql_escape(data.get('number_of_seasons'))}, {sql_escape(data.get('vote_average'))}, "
        f"{sql_escape(data.get('vote_count'))}, {sql_escape(data.get('popularity'))}, "
        f"{sql_escape(data.get('original_language'))})"
    )
    try:
        d1_exec(sql)
    except RuntimeError as e:
        print(f"    Failed to insert series {tmdb_id}: {e}")
        return None

    rows = d1_query(f"SELECT id FROM series WHERE tmdb_id = {sql_escape(tmdb_id)}")
    if not rows:
        return None
    return int(rows[0]["id"])


def insert_series_genres_to_d1(series_id: int, genres: list[dict]):
    """Insert genres and series_genres relationships."""
    if not genres:
        return
    statements = []
    for genre in genres:
        gid = genre.get("id")
        gname = genre.get("name")
        if gid and gname:
            statements.append(
                f"INSERT OR IGNORE INTO genres (id, name) VALUES ({sql_escape(gid)}, {sql_escape(gname)})"
            )
            statements.append(
                f"INSERT OR IGNORE INTO series_genres (series_id, genre_id) VALUES ({series_id}, {gid})"
            )
    if statements:
        for i in range(0, len(statements), 20):
            chunk = statements[i:i + 20]
            try:
                d1_batch(chunk)
            except RuntimeError as e:
                print(f"    Series genre insert error: {e}")


def insert_series_trailers_to_d1(series_id: int, videos: list[dict]) -> int:
    """Insert YouTube trailers for a series into D1. Returns count inserted."""
    youtube_videos = [v for v in videos if v.get("site") == "YouTube"]
    if not youtube_videos:
        return 0

    count = 0
    statements = []
    for video in youtube_videos:
        trailer_type = classify_trailer_type(
            video.get("type", ""), video.get("name", "")
        )
        sql = (
            "INSERT OR IGNORE INTO series_trailers "
            "(series_id, youtube_id, title, trailer_type, language, region, "
            "is_official, quality, published_at, source) "
            f"VALUES ({series_id}, {sql_escape(video['key'])}, "
            f"{sql_escape(video.get('name'))}, {sql_escape(trailer_type)}, "
            f"{sql_escape(video.get('iso_639_1'))}, {sql_escape(video.get('iso_3166_1'))}, "
            f"{1 if video.get('official', True) else 0}, "
            f"{sql_escape(video.get('size'))}, "
            f"{sql_escape(video.get('published_at'))}, 'tmdb')"
        )
        statements.append(sql)
        count += 1

    for i in range(0, len(statements), CHUNK_SIZE):
        chunk = statements[i:i + CHUNK_SIZE]
        try:
            d1_batch(chunk)
        except RuntimeError as e:
            print(f"    Series trailer insert error: {e}")
            count -= len(chunk)

    return count


def process_new_series() -> tuple[int, int, list[dict]]:
    """Step 4: Find new series from TMDB export and insert them.

    Returns (series_added, trailers_added, new_series_details).
    """
    print("\n=== Step 4: Find new series ===")
    export_path = download_export("tv_series_ids")
    if not export_path:
        print("  Skipping: export download failed")
        return 0, 0, []

    export_ids = parse_export_ids(export_path)
    print(f"  TMDB export contains {len(export_ids):,} series IDs")

    existing_ids = get_existing_series_tmdb_ids()
    new_ids = sorted(export_ids - existing_ids)
    print(f"  New series IDs: {len(new_ids):,}")

    if not new_ids:
        print("  No new series to process")
        return 0, 0, []

    if len(new_ids) > MAX_NEW_SERIES:
        print(f"  Capping to {MAX_NEW_SERIES} newest IDs")
        new_ids = new_ids[-MAX_NEW_SERIES:]

    print(f"  Fetching and inserting {len(new_ids)} new series...")
    series_added = 0
    trailers_added = 0
    new_series_details = []

    for i, tmdb_id in enumerate(new_ids):
        data = tmdb_get(f"/tv/{tmdb_id}", {
            "language": "en-US",
            "append_to_response": "videos",
        })
        if data is None:
            continue

        series_id = insert_series_to_d1(data)
        if series_id is None:
            continue

        series_added += 1

        # Genres
        insert_series_genres_to_d1(series_id, data.get("genres", []))

        # Trailers
        videos = data.get("videos", {}).get("results", [])
        t_count = insert_series_trailers_to_d1(series_id, videos)
        trailers_added += t_count

        # Collect detail for JSON export
        new_series_details.append({
            "d1_id": series_id,
            "tmdb_data": data,
            "trailers": [v for v in videos if v.get("site") == "YouTube"],
        })

        if (i + 1) % 50 == 0 or (i + 1) == len(new_ids):
            print(f"  Progress: {i + 1}/{len(new_ids)} — "
                  f"{series_added} series, {trailers_added} trailers")

    print(f"  Done: {series_added} series added, {trailers_added} trailers")
    return series_added, trailers_added, new_series_details


# ---------------------------------------------------------------------------
# Step 5: Export JSON files
# ---------------------------------------------------------------------------

def write_new_movie_json_files(new_movie_details: list[dict]):
    """Write individual JSON files for newly added movies."""
    if not new_movie_details:
        return
    print(f"\n  Writing {len(new_movie_details)} new movie JSON files...")
    movie_dir = OUTPUT_DIR / "movie"
    movie_dir.mkdir(parents=True, exist_ok=True)

    for item in new_movie_details:
        data = item["tmdb_data"]
        imdb_id = data.get("imdb_id")
        if not imdb_id:
            continue

        title = data.get("title", "Unknown")
        release_date = data.get("release_date")
        year = None
        if release_date and len(release_date) >= 4:
            try:
                year = int(release_date[:4])
            except ValueError:
                pass

        slug = make_slug(title, year, imdb_id)
        genres_list = [g["name"] for g in data.get("genres", []) if g.get("name")]

        trailers = []
        for v in item["trailers"]:
            trailer_type = classify_trailer_type(v.get("type", ""), v.get("name", ""))
            trailers.append({
                "youtube_id": v["key"],
                "title": v.get("name"),
                "type": trailer_type,
                "language": v.get("iso_639_1"),
                "region": v.get("iso_3166_1"),
                "is_official": bool(v.get("official", True)),
                "published_at": v.get("published_at"),
                "quality": v.get("size"),
                "channel_name": None,
                "duration": None,
                "views": None,
            })

        detail = {
            "imdb_id": imdb_id,
            "tmdb_id": data.get("id"),
            "title": title,
            "original_title": data.get("original_title"),
            "year": year,
            "release_date": release_date,
            "imdb_rating": None,
            "imdb_votes": None,
            "runtime": data.get("runtime"),
            "overview": data.get("overview"),
            "poster_path": data.get("poster_path"),
            "backdrop_path": data.get("backdrop_path"),
            "original_language": data.get("original_language"),
            "genres": genres_list,
            "slug": slug,
            "trailers": trailers,
            "trailer_groups": [],
        }

        filepath = movie_dir / f"{imdb_id}.json"
        filepath.write_text(json.dumps(detail, separators=(",", ":")), encoding="utf-8")

    print(f"  Wrote {len(new_movie_details)} movie JSON files")


def write_new_series_json_files(new_series_details: list[dict]):
    """Write individual JSON files for newly added series."""
    if not new_series_details:
        return
    print(f"\n  Writing {len(new_series_details)} new series JSON files...")
    series_dir = OUTPUT_DIR / "series"
    series_dir.mkdir(parents=True, exist_ok=True)

    for item in new_series_details:
        data = item["tmdb_data"]
        tmdb_id = data.get("id")
        name = data.get("name") or data.get("original_name") or f"Unknown Series {tmdb_id}"

        slug = make_series_slug(name, tmdb_id)
        genres_list = [g["name"] for g in data.get("genres", []) if g.get("name")]

        first_air_date = data.get("first_air_date")

        trailers = []
        for v in item["trailers"]:
            trailer_type = classify_trailer_type(v.get("type", ""), v.get("name", ""))
            trailers.append({
                "youtube_id": v["key"],
                "title": v.get("name"),
                "trailer_type": trailer_type,
                "language": v.get("iso_639_1"),
                "region": v.get("iso_3166_1"),
                "is_official": bool(v.get("official", True)),
                "published_at": v.get("published_at"),
                "quality": v.get("size"),
            })

        detail = {
            "tmdb_id": tmdb_id,
            "name": name,
            "original_name": data.get("original_name"),
            "first_air_date": first_air_date,
            "overview": data.get("overview"),
            "poster_path": data.get("poster_path"),
            "backdrop_path": data.get("backdrop_path"),
            "status": data.get("status"),
            "number_of_seasons": data.get("number_of_seasons"),
            "vote_average": data.get("vote_average"),
            "vote_count": data.get("vote_count"),
            "original_language": data.get("original_language"),
            "genres": genres_list,
            "slug": slug,
            "trailers": trailers,
        }

        filepath = series_dir / f"{tmdb_id}.json"
        filepath.write_text(json.dumps(detail, separators=(",", ":")), encoding="utf-8")

    print(f"  Wrote {len(new_series_details)} series JSON files")


def export_stats_from_d1():
    """Query D1 for aggregate stats and write stats.json."""
    print("\n  Exporting stats.json...")
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
    stats["top_channels"] = [{"name": r["channel_name"], "trailers": r["cnt"], "views": r["total_views"]} for r in rows]

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
    stats["duration_by_type"] = {r["trailer_type"]: {"avg_seconds": r["avg_dur"], "count": r["cnt"]} for r in rows}

    output = OUTPUT_DIR / "stats.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(stats, separators=(",", ":")), encoding="utf-8")
    print(f"  Wrote {output}")


def export_trending_from_d1():
    """Query D1 for trending trailers and write trending.json."""
    print("  Exporting trending.json...")

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
    print(f"  Wrote {output} ({len(trending)} trailers)")


def export_analytics_from_d1():
    """Query D1 for analytics aggregates and write analytics.json."""
    print("  Exporting analytics.json...")
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

    # 4. by_year (2000-2026)
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

    # 8. overperformers — trailers that beat their type avg by 10x+
    # Get type averages first
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
    print(f"  Wrote {output}")


def export_browse_shards_from_d1():
    """Query D1 for browse shard data and write JSON files."""
    print("  Exporting browse shards...")
    browse_dir = OUTPUT_DIR / "browse"
    browse_dir.mkdir(parents=True, exist_ok=True)

    # Build genre map from D1
    genre_rows = d1_query("SELECT id, name FROM genres ORDER BY name")
    genre_map = {r["id"]: r["name"] for r in genre_rows}

    # Get the browse index data: movies with trailers
    # We need: imdb_id, title, year, rating, votes, poster, genre_ids, tmdb_id, slug, trailer_count, popularity
    print("    Fetching movie browse data from D1...")
    movie_rows = d1_query(
        "SELECT m.id, m.imdb_id, m.title, m.year, m.imdb_rating, m.imdb_votes, "
        "m.poster_path, m.tmdb_id, m.tmdb_popularity "
        "FROM movies m "
        "WHERE m.id IN (SELECT DISTINCT movie_id FROM trailers) "
        "ORDER BY m.imdb_votes DESC"
    )

    # Get genre mappings
    mg_rows = d1_query("SELECT movie_id, genre_id FROM movie_genres")
    movie_genres: dict[int, list[int]] = {}
    for r in mg_rows:
        movie_genres.setdefault(r["movie_id"], []).append(r["genre_id"])

    # Get trailer counts
    tc_rows = d1_query("SELECT movie_id, COUNT(*) AS cnt FROM trailers GROUP BY movie_id")
    trailer_counts = {r["movie_id"]: r["cnt"] for r in tc_rows}

    # Build movie arrays (same format as export.py)
    movies = []
    for row in movie_rows:
        mid = row["id"]
        imdb_id = row["imdb_id"]
        title = row["title"]
        year = row["year"]
        rating = row["imdb_rating"]
        votes = row["imdb_votes"]
        poster = row["poster_path"]
        tmdb_id = row["tmdb_id"]
        popularity = row["tmdb_popularity"]
        slug = make_slug(title, year, imdb_id)
        genres = movie_genres.get(mid, [])
        count = trailer_counts.get(mid, 0)
        movies.append([
            imdb_id, title, year, rating, votes,
            poster, genres, tmdb_id, slug, count, popularity or 0
        ])

    # Fields index: imdb_id=0, title=1, year=2, rating=3, votes=4, poster=5, genres=6, tmdb_id=7, slug=8, count=9, popularity=10

    # Trending (top 100 by popularity)
    trending = sorted(movies, key=lambda m: m[10] or 0, reverse=True)[:100]
    (browse_dir / "trending.json").write_text(json.dumps(trending, separators=(",", ":")))

    # Top rated (top 100 by rating, min 10000 votes)
    top_rated = sorted(
        [m for m in movies if (m[4] or 0) >= 10000],
        key=lambda m: m[3] or 0, reverse=True
    )[:100]
    (browse_dir / "top-rated.json").write_text(json.dumps(top_rated, separators=(",", ":")))

    # Most trailers (top 100)
    most_trailers = sorted(movies, key=lambda m: m[9], reverse=True)[:100]
    (browse_dir / "most-trailers.json").write_text(json.dumps(most_trailers, separators=(",", ":")))

    # Recent (2020+)
    current_year = datetime.utcnow().year
    recent = sorted(
        [m for m in movies if m[2] and m[2] >= 2020],
        key=lambda m: (m[2], m[4] or 0), reverse=True
    )[:200]
    (browse_dir / "recent.json").write_text(json.dumps(recent, separators=(",", ":")))

    # Genre metadata
    genre_id_to_slug = {}
    genre_meta = []
    for gid, name in sorted(genre_map.items(), key=lambda x: x[1]):
        genre_slug = slugify(name)
        genre_id_to_slug[gid] = genre_slug
        count = len([m for m in movies if gid in m[6]])
        if count > 0:
            genre_meta.append({"id": gid, "name": name, "slug": genre_slug, "count": count})
    (browse_dir / "genres.json").write_text(json.dumps(genre_meta, separators=(",", ":")))

    # By genre
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

    # By year (1920-current)
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
            label = f"{decade_start}s"
            (decade_dir / f"{label}.json").write_text(
                json.dumps(decade_movies, separators=(",", ":"))
            )

    # --- Series browse shards ---
    print("    Fetching series browse data from D1...")
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
            row["poster_path"], genres, slug, count, row["popularity"] or 0
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

    print(f"    Wrote browse shards to {browse_dir}")


def export_json_from_d1():
    """Step 5: Re-export all small JSON files from D1."""
    print("\n=== Step 5: Export JSON from D1 ===")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    export_stats_from_d1()
    export_trending_from_d1()
    export_analytics_from_d1()
    export_browse_shards_from_d1()

    print("  JSON export complete")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("TrailerDB Daily Update (D1)")
    print("=" * 60)
    start_time = time.time()

    # Validate environment
    missing = []
    if not TMDB_API_KEY:
        missing.append("TMDB_API_KEY")
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

    # Step 1+2: New movies
    movies_added, movie_trailers, new_movie_details = process_new_movies()

    # Step 3: Refresh popular movies
    popular_trailers = refresh_popular_movies()

    # Step 4: New series
    series_added, series_trailers, new_series_details = process_new_series()

    # Write individual JSON files for new movies/series
    write_new_movie_json_files(new_movie_details)
    write_new_series_json_files(new_series_details)

    # Step 5: Re-export aggregate JSON files
    export_json_from_d1()

    # Summary
    elapsed = time.time() - start_time
    total_trailers = movie_trailers + popular_trailers + series_trailers
    print("\n" + "=" * 60)
    print("Daily Update Summary")
    print("=" * 60)
    print(f"  New movies added:            {movies_added:,}")
    print(f"  Trailers from new movies:    {movie_trailers:,}")
    print(f"  Trailers from popular check: {popular_trailers:,}")
    print(f"  New series added:            {series_added:,}")
    print(f"  Trailers from new series:    {series_trailers:,}")
    print(f"  Total new trailers:          {total_trailers:,}")
    print(f"  Time elapsed:                {elapsed:.0f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
