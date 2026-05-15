"""Export Phase 7 results from local SQLite to Cloudflare D1.

Async + parallel D1 batch writes for fast bulk transfer of millions of rows.
Idempotent: re-running picks up where it left off via OR IGNORE / OR REPLACE.

Usage:
    CF_API_TOKEN=... python3 scripts/export_phase7_to_d1.py
"""

import asyncio
import os
import sqlite3
import sys
import time
from pathlib import Path

import aiohttp

CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "ff3544f44f2313a5f2950c3cf6893546")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "66f80a02-0079-4601-8886-8d4411227cd0")

if not CF_API_TOKEN:
    raise SystemExit("ERROR: CF_API_TOKEN environment variable is required")

LOCAL_DB = Path(__file__).parent.parent / "db" / "trailerdb.db"
D1_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/raw"
HEADERS = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}

STMTS_PER_BATCH = 500       # D1 has a ~100KB body limit; 500 short INSERTs fit comfortably
PARALLEL_BATCHES = 6        # concurrent D1 calls
MAX_RETRIES = 3


def sql_escape(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


async def d1_batch(session, statements: list[str]) -> int:
    if not statements:
        return 0
    combined = ";\n".join(s.rstrip(";") for s in statements) + ";"
    for attempt in range(MAX_RETRIES):
        try:
            async with session.post(D1_URL, headers=HEADERS, json={"sql": combined},
                                    timeout=aiohttp.ClientTimeout(total=180)) as resp:
                data = await resp.json()
                if data.get("success"):
                    return len(statements)
                errs = data.get("errors")
        except Exception as e:
            errs = [{"message": str(e)}]
        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(2 ** attempt)
            continue
        print(f"  D1 batch failed after {MAX_RETRIES} retries: {errs}", file=sys.stderr)
        return 0
    return 0


async def push_batches(session, queue: asyncio.Queue, stats: dict):
    while True:
        batch = await queue.get()
        if batch is None:
            queue.task_done()
            return
        n = await d1_batch(session, batch)
        stats["pushed"] += n
        queue.task_done()


async def push_table(conn: sqlite3.Connection, session, table: str, columns: list[str],
                     replace: bool = False) -> int:
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    total = cur.fetchone()[0]
    print(f"\n  {table}: {total:,} rows")
    if total == 0:
        return 0

    cur.execute(f"SELECT {', '.join(columns)} FROM {table}")
    queue: asyncio.Queue = asyncio.Queue(maxsize=PARALLEL_BATCHES * 2)
    stats = {"pushed": 0}
    workers = [asyncio.create_task(push_batches(session, queue, stats))
               for _ in range(PARALLEL_BATCHES)]

    verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    col_list = ", ".join(columns)
    batch: list[str] = []
    last_log = time.monotonic()
    start = last_log

    for row in cur:
        values = ", ".join(sql_escape(v) for v in row)
        batch.append(f"{verb} INTO {table} ({col_list}) VALUES ({values})")
        if len(batch) >= STMTS_PER_BATCH:
            await queue.put(batch)
            batch = []
            now = time.monotonic()
            if now - last_log > 5:
                pct = stats["pushed"] / total * 100
                rate = stats["pushed"] / (now - start) if now > start else 0
                eta_s = (total - stats["pushed"]) / rate if rate > 0 else 0
                print(f"    {stats['pushed']:,}/{total:,} ({pct:.1f}%) — {rate:.0f}/s, ETA {int(eta_s/60)}m {int(eta_s%60)}s")
                last_log = now
    if batch:
        await queue.put(batch)
    for _ in range(PARALLEL_BATCHES):
        await queue.put(None)
    await asyncio.gather(*workers)

    elapsed = time.monotonic() - start
    print(f"    {stats['pushed']:,}/{total:,} done in {int(elapsed)}s")
    return stats["pushed"]


async def main():
    if not LOCAL_DB.exists():
        print(f"ERROR: local DB not found at {LOCAL_DB}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(LOCAL_DB))
    conn.row_factory = sqlite3.Row

    start = time.monotonic()
    print("=== Exporting Phase 7 data: SQLite → D1 ===", flush=True)

    connector = aiohttp.TCPConnector(limit=PARALLEL_BATCHES * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        await push_table(conn, session, "trailer_metadata",
            ["movie_id", "youtube_id", "category", "upload_date", "publish_date",
             "is_family_safe", "is_unlisted", "is_private", "available_country_count",
             "has_chapters", "chapters_json", "length_seconds", "view_count_snapshot",
             "fetch_status", "processed_at"], replace=True)
        await push_table(conn, session, "trailer_subtitles",
            ["movie_id", "youtube_id", "language", "is_auto_generated", "formats"])
        await push_table(conn, session, "trailer_audio_tracks",
            ["movie_id", "youtube_id", "language", "is_original", "is_auto_dubbed", "display_name"])
        await push_table(conn, session, "trailer_availability",
            ["movie_id", "youtube_id", "country_code"])
        await push_table(conn, session, "trailer_formats",
            ["movie_id", "youtube_id", "format_id", "height", "width", "vcodec", "acodec", "fps", "filesize"])

    elapsed = time.monotonic() - start
    h, r = divmod(int(elapsed), 3600)
    m, s = divmod(r, 60)
    print(f"\n=== Done in {h}h {m:02d}m {s:02d}s ===")


if __name__ == "__main__":
    asyncio.run(main())
