"""Import TrailerDB data into Cloudflare D1 in chunks."""

import json
import sqlite3
import requests
import time
import sys

config = json.load(open("/tmp/d1_config.json"))
ACCOUNT_ID = config["account_id"]
DB_ID = config["db_id"]
TOKEN = config["token"]
URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB_ID}/raw"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

CHUNK_SIZE = 50  # rows per INSERT (D1 has 100KB statement limit)


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
    print(f"\n{label}: {total:,} rows")

    for i in range(0, total, CHUNK_SIZE):
        chunk = rows[i:i + CHUNK_SIZE]
        values = ", ".join(
            "(" + ", ".join(escape(v) for v in row) + ")"
            for row in chunk
        )
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES {values};"

        for attempt in range(3):
            try:
                resp = requests.post(URL, headers=HEADERS, json={"sql": sql}, timeout=30)
                data = resp.json()
                if data.get("success"):
                    break
                else:
                    print(f"  Error at {i}: {data.get('errors', [])}")
                    if attempt < 2:
                        time.sleep(2)
            except Exception as e:
                print(f"  Request failed at {i}: {e}")
                if attempt < 2:
                    time.sleep(5)

        done = min(i + CHUNK_SIZE, total)
        if done % 5000 < CHUNK_SIZE:
            print(f"  {done:,}/{total:,} ({done/total*100:.0f}%)")

    print(f"  Done: {total:,} rows imported")


def main():
    db = sqlite3.connect("db/trailerdb.db")

    # Genres (tiny)
    import_table(db, "genres", ["id", "name"],
                 "SELECT id, name FROM genres")

    # Movies (106K — only those with trailers, skip overview to stay under 100KB limit)
    import_table(db, "movies",
                 ["id", "imdb_id", "tmdb_id", "title", "year", "imdb_rating", "imdb_votes", "runtime", "poster_path", "original_language"],
                 "SELECT id, imdb_id, tmdb_id, title, year, imdb_rating, imdb_votes, runtime, poster_path, original_language FROM movies WHERE id IN (SELECT DISTINCT movie_id FROM trailers)")

    # Trailers (290K)
    import_table(db, "trailers",
                 ["id", "movie_id", "youtube_id", "title", "trailer_type", "language", "view_count", "like_count", "duration_seconds", "channel_name", "published_at", "is_available"],
                 "SELECT id, movie_id, youtube_id, title, trailer_type, language, view_count, like_count, duration_seconds, channel_name, published_at, is_available FROM trailers WHERE is_available = 1")

    # Series (24K with trailers)
    import_table(db, "series",
                 ["id", "tmdb_id", "name", "first_air_date", "overview", "poster_path", "vote_average", "vote_count", "number_of_seasons", "status"],
                 "SELECT id, tmdb_id, name, first_air_date, overview, poster_path, vote_average, vote_count, number_of_seasons, status FROM series WHERE id IN (SELECT DISTINCT series_id FROM series_trailers)")

    db.close()
    print("\n=== Import complete ===")


if __name__ == "__main__":
    main()
