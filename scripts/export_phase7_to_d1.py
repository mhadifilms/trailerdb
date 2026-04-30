"""Export Phase 7 results from local SQLite to Cloudflare D1.

Reads trailer_subtitles, trailer_audio_tracks, trailer_formats,
trailer_availability, trailer_metadata from the local DB and pushes them
to D1 via the REST API.

Idempotent: every INSERT uses OR IGNORE / OR REPLACE, so re-running
won't duplicate. Safe to run while Phase 7 is still going (newer rows
will sync on a re-run).

Usage:
    python scripts/export_phase7_to_d1.py
"""

import os
import sqlite3
import sys
import time
from pathlib import Path

import requests

CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "ff3544f44f2313a5f2950c3cf6893546")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "66f80a02-0079-4601-8886-8d4411227cd0")

if not CF_API_TOKEN:
    raise SystemExit("ERROR: CF_API_TOKEN environment variable is required")

LOCAL_DB = Path(__file__).parent.parent / "db" / "trailerdb.db"
STMTS_PER_BATCH = 50


def sql_escape(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def d1_batch(statements: list[str]) -> None:
    if not statements:
        return
    combined = ";\n".join(s.rstrip(";") for s in statements) + ";"
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}
    for attempt in range(3):
        try:
            r = requests.post(url, headers=headers, json={"sql": combined}, timeout=120)
            data = r.json()
            if data.get("success"):
                return
            errs = data.get("errors")
        except Exception as e:
            errs = [{"message": str(e)}]
        if attempt < 2:
            time.sleep(3)
            continue
        raise RuntimeError(f"D1 batch error: {errs}")


def push_table(conn: sqlite3.Connection, table: str, columns: list[str], replace: bool = False) -> int:
    """Stream rows from local SQLite into D1 in batches. Returns total rows pushed."""
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    total = cur.fetchone()[0]
    if total == 0:
        print(f"  {table}: empty, skipping")
        return 0

    print(f"  {table}: {total:,} rows")
    cur.execute(f"SELECT {', '.join(columns)} FROM {table}")
    pushed = 0
    batch: list[str] = []
    verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    last_log = time.monotonic()

    for row in cur:
        values = ", ".join(sql_escape(v) for v in row)
        batch.append(f"{verb} INTO {table} ({', '.join(columns)}) VALUES ({values})")
        if len(batch) >= STMTS_PER_BATCH:
            d1_batch(batch)
            pushed += len(batch)
            batch = []
            now = time.monotonic()
            if now - last_log > 5:
                pct = pushed / total * 100
                print(f"    {pushed:,}/{total:,} ({pct:.1f}%)")
                last_log = now

    if batch:
        d1_batch(batch)
        pushed += len(batch)

    print(f"    {pushed:,}/{total:,} done")
    return pushed


def main():
    if not LOCAL_DB.exists():
        print(f"ERROR: local DB not found at {LOCAL_DB}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(LOCAL_DB))
    conn.row_factory = sqlite3.Row

    start = time.monotonic()
    print("=== Exporting Phase 7 data: SQLite → D1 ===")

    # Order: independent tables first, metadata last (REPLACE on it).
    push_table(conn, "trailer_subtitles",
        ["movie_id", "youtube_id", "language", "is_auto_generated", "formats"])
    push_table(conn, "trailer_audio_tracks",
        ["movie_id", "youtube_id", "language", "is_original", "is_auto_dubbed", "display_name"])
    push_table(conn, "trailer_formats",
        ["movie_id", "youtube_id", "format_id", "height", "width", "vcodec", "acodec", "fps", "filesize"])
    push_table(conn, "trailer_availability",
        ["movie_id", "youtube_id", "country_code"])
    push_table(conn, "trailer_metadata",
        ["movie_id", "youtube_id", "category", "upload_date", "publish_date",
         "is_family_safe", "is_unlisted", "is_private", "available_country_count",
         "has_chapters", "chapters_json", "length_seconds", "view_count_snapshot",
         "fetch_status", "processed_at"],
        replace=True)

    elapsed = time.monotonic() - start
    h, r = divmod(int(elapsed), 3600)
    m, s = divmod(r, 60)
    print(f"=== Done in {h}h {m:02d}m {s:02d}s ===")


if __name__ == "__main__":
    main()
