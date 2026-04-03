"""Import TrailerDB data into Cloudflare D1 in chunks with auto token refresh."""

import json
import sqlite3
import requests
import time
import os

ACCOUNT_ID = "ff3544f44f2313a5f2950c3cf6893546"
DB_ID = "66f80a02-0079-4601-8886-8d4411227cd0"
WRANGLER_CONFIG = os.path.expanduser("~/Library/Preferences/.wrangler/config/default.toml")
CHUNK_SIZE = 50

# Token management
_token = None
_token_time = 0


def get_token():
    """Get a valid OAuth token, refreshing if needed."""
    global _token, _token_time

    # Refresh every 45 minutes (tokens last ~1 hour)
    if _token and (time.time() - _token_time) < 2700:
        return _token

    # Read refresh token from wrangler config
    with open(WRANGLER_CONFIG) as f:
        content = f.read()
    refresh_token = None
    for line in content.split("\n"):
        if "refresh_token" in line:
            refresh_token = line.split('"')[1]
            break

    if not refresh_token:
        raise RuntimeError("No refresh token found in wrangler config")

    resp = requests.post("https://dash.cloudflare.com/oauth2/token", data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": "54d11594-84e4-41aa-b438-e81b8fa78ee7",
    })
    data = resp.json()
    if "access_token" not in data:
        raise RuntimeError(f"Token refresh failed: {data}")

    _token = data["access_token"]
    _token_time = time.time()
    print(f"  [token refreshed]", flush=True)
    return _token


def d1_query(sql):
    """Execute SQL against D1 with auto token refresh."""
    token = get_token()
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB_ID}/raw"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json={"sql": sql}, timeout=30)
    return resp.json()


def escape(val):
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''")
    return f"'{s}'"


def import_table(db, table, columns, query, label=None):
    label = label or table
    cursor = db.execute(query)
    rows = cursor.fetchall()
    total = len(rows)
    print(f"\n{label}: {total:,} rows", flush=True)

    imported = 0
    errors = 0

    for i in range(0, total, CHUNK_SIZE):
        chunk = rows[i:i + CHUNK_SIZE]
        values = ", ".join(
            "(" + ", ".join(escape(v) for v in row) + ")"
            for row in chunk
        )
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES {values};"

        for attempt in range(3):
            try:
                data = d1_query(sql)
                if data.get("success"):
                    imported += len(chunk)
                    break
                else:
                    err = data.get("errors", [])
                    if any("authentication" in str(e).lower() for e in err):
                        # Force token refresh
                        global _token_time
                        _token_time = 0
                        continue
                    print(f"  Error at {i}: {err}", flush=True)
                    errors += 1
                    if attempt < 2:
                        time.sleep(2)
            except Exception as e:
                print(f"  Request failed at {i}: {e}", flush=True)
                if attempt < 2:
                    time.sleep(5)

        done = min(i + CHUNK_SIZE, total)
        if done % 5000 < CHUNK_SIZE or done == total:
            print(f"  {done:,}/{total:,} ({done/total*100:.0f}%) — {imported:,} imported, {errors} errors", flush=True)

    print(f"  Done: {imported:,} imported, {errors} errors", flush=True)


def main():
    db = sqlite3.connect("db/trailerdb.db")

    # Genres
    import_table(db, "genres", ["id", "name"],
                 "SELECT id, name FROM genres")

    # Movies (skip overview to stay under 100KB)
    import_table(db, "movies",
                 ["id", "imdb_id", "tmdb_id", "title", "year", "imdb_rating", "imdb_votes", "runtime", "poster_path", "original_language"],
                 "SELECT id, imdb_id, tmdb_id, title, year, imdb_rating, imdb_votes, runtime, poster_path, original_language FROM movies WHERE id IN (SELECT DISTINCT movie_id FROM trailers)")

    # Trailers
    import_table(db, "trailers",
                 ["id", "movie_id", "youtube_id", "title", "trailer_type", "language", "view_count", "like_count", "duration_seconds", "channel_name", "published_at", "is_available"],
                 "SELECT id, movie_id, youtube_id, title, trailer_type, language, view_count, like_count, duration_seconds, channel_name, published_at, is_available FROM trailers WHERE is_available = 1")

    # Series
    import_table(db, "series",
                 ["id", "tmdb_id", "name", "first_air_date", "poster_path", "vote_average", "vote_count", "number_of_seasons", "status"],
                 "SELECT id, tmdb_id, name, first_air_date, poster_path, vote_average, vote_count, number_of_seasons, status FROM series WHERE id IN (SELECT DISTINCT series_id FROM series_trailers)")

    db.close()
    print("\n=== Import complete ===", flush=True)


if __name__ == "__main__":
    main()
