"""Robust D1 import — reads fresh token every request, handles all errors."""
import sqlite3, requests, time, os, sys

ACCOUNT = "ff3544f44f2313a5f2950c3cf6893546"
DB_ID = "66f80a02-0079-4601-8886-8d4411227cd0"
CONFIG = os.path.expanduser("~/Library/Preferences/.wrangler/config/default.toml")
CHUNK = 50

def token():
    with open(CONFIG) as f:
        for line in f:
            if line.startswith("oauth_token"):
                return line.split('"')[1]
    raise RuntimeError("No token")

def d1(sql):
    t = token()
    r = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB_ID}/raw",
        headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
        json={"sql": sql}, timeout=30
    )
    return r.json()

def esc(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def load(db, table, cols, query):
    rows = db.execute(query).fetchall()
    total = len(rows)
    ok = err = 0
    print(f"\n{table}: {total:,} rows", flush=True)
    for i in range(0, total, CHUNK):
        chunk = rows[i:i+CHUNK]
        vals = ",".join("(" + ",".join(esc(v) for v in r) + ")" for r in chunk)
        sql = f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES {vals};"
        try:
            data = d1(sql)
            if data.get("success"):
                ok += len(chunk)
            else:
                errs = data.get("errors", [])
                if any("auth" in str(e).lower() for e in errs):
                    print(f"  AUTH ERROR at {i} — token may be expired. Re-login with: wrangler login", flush=True)
                    return
                err += 1
                if err <= 3:
                    print(f"  ERR@{i}: {errs}", flush=True)
        except requests.exceptions.Timeout:
            err += 1
            time.sleep(2)
        except Exception as e:
            err += 1
            if err <= 3:
                print(f"  FAIL@{i}: {e}", flush=True)
            time.sleep(1)
        if (i+CHUNK) % 5000 < CHUNK:
            print(f"  {min(i+CHUNK,total):,}/{total:,} ({(i+CHUNK)/total*100:.0f}%) ok={ok:,} err={err}", flush=True)
    print(f"  DONE: {ok:,} imported, {err} errors", flush=True)

db = sqlite3.connect("db/trailerdb.db")

# Only import what's specified on command line, or all
what = sys.argv[1] if len(sys.argv) > 1 else "all"

if what in ("movies", "all"):
    load(db, "movies",
        ["id","imdb_id","tmdb_id","title","year","imdb_rating","imdb_votes","runtime","poster_path","original_language"],
        "SELECT id,imdb_id,tmdb_id,title,year,imdb_rating,imdb_votes,runtime,poster_path,original_language FROM movies WHERE id IN (SELECT DISTINCT movie_id FROM trailers)")

if what in ("trailers", "all"):
    load(db, "trailers",
        ["id","movie_id","youtube_id","title","trailer_type","language","view_count","like_count","duration_seconds","channel_name","published_at","is_available"],
        "SELECT id,movie_id,youtube_id,title,trailer_type,language,view_count,like_count,duration_seconds,channel_name,published_at,is_available FROM trailers WHERE is_available=1")

if what in ("series", "all"):
    load(db, "series",
        ["id","tmdb_id","name","first_air_date","poster_path","vote_average","vote_count","number_of_seasons","status"],
        "SELECT id,tmdb_id,name,first_air_date,poster_path,vote_average,vote_count,number_of_seasons,status FROM series WHERE id IN (SELECT DISTINCT series_id FROM series_trailers)")

db.close()
print("\n=== DONE ===", flush=True)
