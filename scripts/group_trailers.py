"""Group trailers by language for TrailerDB.

Trailers that are the "same trailer in different languages" must share:
1. Same movie_id and trailer_type
2. Similar published_at date (within 2 days — same release window)
3. Compatible duration (within 5 seconds)
4. Different languages (same language = definitely different trailers)
5. Similar "numbering" — "Trailer 2" in English matches "Bande-annonce 2" in French

The key insight: studios release the same trailer in multiple languages within
1-2 days. If two trailers of the same type are published a week apart, they're
different trailers (e.g. Trailer #1 vs Trailer #2).
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import defaultdict
from datetime import datetime

from pipeline.db import get_connection

logger = logging.getLogger(__name__)

DATE_WINDOW_DAYS = 2  # Tighter: same release window only
DURATION_TOLERANCE_SECONDS = 5


def parse_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00").split("T")[0])
    except (ValueError, AttributeError):
        return None


def extract_number(title: str | None) -> int | None:
    """Extract trailer number from title: 'Official Trailer #2' → 2, 'Trailer 3' → 3."""
    if not title:
        return None
    # Match patterns like "#2", "Trailer 2", "Bande-annonce 2", "Tráiler 2"
    m = re.search(r'#(\d+)', title)
    if m:
        return int(m.group(1))
    m = re.search(r'(?:trailer|bande[- ]annonce|tráiler|teaser|spot)\s*(\d+)', title, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # "Final Trailer", "First Trailer" etc — these are descriptive, not numbered
    return None


def numbers_compatible(n1: int | None, n2: int | None) -> bool:
    """Two trailers must have the same number (or both no number) to be grouped."""
    return n1 == n2


def dates_within_window(d1: datetime | None, d2: datetime | None) -> bool:
    if d1 is None or d2 is None:
        return False
    return abs((d1 - d2).days) <= DATE_WINDOW_DAYS


def durations_compatible(dur1: int | None, dur2: int | None) -> bool:
    if dur1 is None or dur2 is None:
        return True
    return abs(dur1 - dur2) <= DURATION_TOLERANCE_SECONDS


def extract_descriptor(title: str | None) -> str:
    """Extract a normalized descriptor to help match across languages.
    'Official Trailer' → 'official', 'Final Trailer #2' → 'final_2'
    'Bande-annonce officielle' → uses number only since words differ by language
    """
    if not title:
        return ''
    num = extract_number(title)
    lower = title.lower()
    # Check for common English descriptors
    for word in ['final', 'first', 'second', 'third', 'new', 'international']:
        if word in lower:
            return f"{word}_{num}" if num else word
    return f"_{num}" if num else ''


def pick_canonical_title(group: list[dict]) -> str:
    english = [t for t in group if (t.get("language") or "").startswith("en")]
    if english:
        return english[0]["title"] or "Untitled"
    for t in group:
        if t.get("title"):
            return t["title"]
    return "Untitled"


def pick_canonical_published_at(group: list[dict]) -> str | None:
    dates = [t["published_at"] for t in group if t.get("published_at")]
    return min(dates) if dates else None


def group_trailers_for_movie(trailers: list[dict]) -> list[list[dict]]:
    """Group a movie's trailers into language clusters with strict matching."""
    by_type: dict[str, list[dict]] = defaultdict(list)
    for t in trailers:
        by_type[t["trailer_type"]].append(t)

    all_groups: list[list[dict]] = []

    for ttype, type_trailers in by_type.items():
        type_trailers.sort(key=lambda t: t.get("published_at") or "9999-99-99")

        groups: list[list[dict]] = []
        used = set()

        for i, t1 in enumerate(type_trailers):
            if i in used:
                continue
            group = [t1]
            used.add(i)
            d1 = parse_date(t1["published_at"])
            dur1 = t1.get("duration_seconds")
            num1 = extract_number(t1.get("title"))
            desc1 = extract_descriptor(t1.get("title"))

            for j, t2 in enumerate(type_trailers):
                if j in used:
                    continue

                # Must be different language
                existing_langs = {x.get("language") for x in group}
                if t2.get("language") in existing_langs:
                    continue

                d2 = parse_date(t2["published_at"])
                dur2 = t2.get("duration_seconds")
                num2 = extract_number(t2.get("title"))

                # Numbers MUST match (Trailer #1 ≠ Trailer #2)
                if not numbers_compatible(num1, num2):
                    continue

                # Duration must be compatible
                if not durations_compatible(dur1, dur2):
                    continue

                # Date-based matching (primary)
                if d1 and d2:
                    if dates_within_window(d1, d2):
                        group.append(t2)
                        used.add(j)
                    continue

                # No dates: match by descriptor similarity
                desc2 = extract_descriptor(t2.get("title"))
                if desc1 == desc2:
                    group.append(t2)
                    used.add(j)

            groups.append(group)

        all_groups.extend(groups)

    return all_groups


async def run():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== TrailerDB Trailer Grouping (v2 — strict matching) ===")

    db = await get_connection()
    await db.execute("PRAGMA busy_timeout = 30000")

    for migration in ["ALTER TABLE trailers ADD COLUMN trailer_group_id INTEGER"]:
        try:
            await db.execute(migration)
            await db.commit()
        except Exception:
            pass

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trailer_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL,
            trailer_type TEXT NOT NULL,
            canonical_title TEXT,
            published_at TEXT,
            languages TEXT,
            trailer_count INTEGER DEFAULT 1,
            UNIQUE(movie_id, id)
        )
    """)
    await db.execute("CREATE INDEX IF NOT EXISTS idx_trailer_groups_movie ON trailer_groups(movie_id)")
    await db.commit()

    # Clear previous
    await db.execute("UPDATE trailers SET trailer_group_id = NULL")
    await db.execute("DELETE FROM trailer_groups")
    await db.commit()
    logger.info("Cleared previous grouping data.")

    cursor = await db.execute("""
        SELECT id, movie_id, youtube_id, title, trailer_type, language,
               published_at, duration_seconds
        FROM trailers WHERE is_available = 1
        ORDER BY movie_id, trailer_type, published_at
    """)
    rows = await cursor.fetchall()

    by_movie: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        by_movie[row["movie_id"]].append({
            "id": row["id"], "movie_id": row["movie_id"],
            "youtube_id": row["youtube_id"], "title": row["title"],
            "trailer_type": row["trailer_type"], "language": row["language"],
            "published_at": row["published_at"], "duration_seconds": row["duration_seconds"],
        })

    total_movies = len(by_movie)
    total_groups = 0
    multi_lang = 0
    processed = 0

    logger.info(f"Processing {len(rows):,} trailers across {total_movies:,} movies...")

    for movie_id, trailers in by_movie.items():
        groups = group_trailers_for_movie(trailers)

        for group in groups:
            canonical_title = pick_canonical_title(group)
            published_at = pick_canonical_published_at(group)
            languages = ",".join(sorted(set(t.get("language") or "unknown" for t in group)))
            trailer_type = group[0]["trailer_type"]

            cur = await db.execute(
                """INSERT INTO trailer_groups (movie_id, trailer_type, canonical_title,
                   published_at, languages, trailer_count) VALUES (?, ?, ?, ?, ?, ?)""",
                (movie_id, trailer_type, canonical_title, published_at, languages, len(group)),
            )
            gid = cur.lastrowid
            for t in group:
                await db.execute("UPDATE trailers SET trailer_group_id = ? WHERE id = ?", (gid, t["id"]))

            total_groups += 1
            if len(group) > 1:
                multi_lang += 1

        processed += 1
        if processed % 10000 == 0:
            await db.commit()
            logger.info(f"  {processed:,}/{total_movies:,} movies...")

    await db.commit()

    logger.info(f"\n=== Grouping Complete ===")
    logger.info(f"  Groups: {total_groups:,} | Multi-language: {multi_lang:,} | Single: {total_groups - multi_lang:,}")

    cursor = await db.execute("SELECT trailer_count, COUNT(*) FROM trailer_groups GROUP BY trailer_count ORDER BY trailer_count")
    for row in await cursor.fetchall():
        logger.info(f"    {row[0]} trailer(s): {row[1]:,} groups")

    await db.close()


if __name__ == "__main__":
    asyncio.run(run())
