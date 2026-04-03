"""CLI runner for the TrailerDB ingestion pipeline."""

import asyncio
import logging
import sys

from pipeline.config import DB_PATH, LOG_LEVEL


async def cmd_phase0():
    from pipeline.phase0_bootstrap import run
    await run()


async def cmd_phase1():
    from pipeline.phase1_resolve import run
    await run()


async def cmd_phase2a():
    from pipeline.phase2a_videos_en import run
    await run()


async def cmd_phase2b():
    from pipeline.phase2b_videos_multi import run
    await run()


async def cmd_phase3():
    from pipeline.phase3_yt_enrich import run
    await run()


async def cmd_phase4():
    from pipeline.phase4_yt_search import run
    await run()


async def cmd_phase5():
    from pipeline.phase5_series_bootstrap import run
    await run()


async def cmd_phase6():
    from pipeline.phase6_series_videos import run
    await run()


async def cmd_phase7():
    from pipeline.phase7_subtitle_audio import run
    await run()


async def cmd_phase7a():
    from pipeline.phase7a_top_movies import run
    await run()


async def cmd_phase8():
    from pipeline.phase8_comments import run
    await run()


async def cmd_phase8a():
    from pipeline.phase8a_comments_top import run
    await run()


async def cmd_phase9():
    from pipeline.phase9_sentiment import run
    await run()


async def cmd_analytics():
    from scripts.compute_analytics import run
    await run()


async def cmd_group_trailers():
    from scripts.group_trailers import run
    await run()


async def cmd_daily_update():
    from scripts.daily_update import run
    await run()


async def cmd_all():
    """Run phases 0 through 2a sequentially (minimum viable database)."""
    await cmd_phase0()
    await cmd_phase1()
    await cmd_phase2a()


async def cmd_status():
    """Show ingestion progress for all phases."""
    import aiosqlite
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row

    phases = [
        ("resolve", None),
        ("videos_en", None),
        ("videos_multi", None),
        ("series_videos", None),
    ]

    print("\n=== TrailerDB Ingestion Status ===\n")

    for phase, lang in phases:
        cursor = await db.execute(
            "SELECT status, COUNT(*) as cnt FROM ingestion_log WHERE phase = ? GROUP BY status",
            (phase,),
        )
        rows = await cursor.fetchall()
        if not rows:
            print(f"  {phase}: no jobs created yet")
            continue

        stats = {r["status"]: r["cnt"] for r in rows}
        total = sum(stats.values())
        done = stats.get("completed", 0) + stats.get("skipped", 0)
        pct = (done / total * 100) if total > 0 else 0
        print(f"  {phase}: {done:,}/{total:,} ({pct:.1f}%) | failed: {stats.get('failed', 0):,}")

    # Phase 7 progress (uses LEFT JOIN approach, not ingestion_log)
    try:
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailers WHERE is_available = 1"
        )
        total_yt = (await cursor.fetchone())[0]
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_subtitles"
        )
        done_yt = (await cursor.fetchone())[0]
        if total_yt > 0:
            pct = done_yt / total_yt * 100
            print(f"  subtitle_audio: {done_yt:,}/{total_yt:,} ({pct:.1f}%)")
    except Exception:
        pass

    # Phase 3 expanded progress
    try:
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailers WHERE is_available = 1"
        )
        total_yt = (await cursor.fetchone())[0]
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailers WHERE is_available = 1 AND description IS NOT NULL"
        )
        enriched_expanded = (await cursor.fetchone())[0]
        if total_yt > 0:
            pct = enriched_expanded / total_yt * 100
            print(f"  yt_expanded:    {enriched_expanded:,}/{total_yt:,} ({pct:.1f}%)")
    except Exception:
        pass

    # Phase 8 comments progress
    try:
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailers WHERE is_available = 1"
        )
        total_yt = (await cursor.fetchone())[0]
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_comments"
        )
        done_comments = (await cursor.fetchone())[0]
        if total_yt > 0:
            pct = done_comments / total_yt * 100
            print(f"  comments:       {done_comments:,}/{total_yt:,} ({pct:.1f}%)")
    except Exception:
        pass

    # Phase 9 sentiment progress
    try:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM trailer_comments WHERE text != '__comments_disabled__'"
        )
        total_comments = (await cursor.fetchone())[0]
        cursor = await db.execute(
            "SELECT COUNT(*) FROM trailer_comments WHERE sentiment IS NOT NULL AND text != '__comments_disabled__'"
        )
        scored = (await cursor.fetchone())[0]
        if total_comments > 0:
            pct = scored / total_comments * 100
            print(f"  sentiment:      {scored:,}/{total_comments:,} ({pct:.1f}%)")
    except Exception:
        pass

    print()
    await db.close()


async def cmd_stats():
    """Show database statistics."""
    import aiosqlite
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row

    print("\n=== TrailerDB Statistics ===\n")

    cursor = await db.execute("SELECT COUNT(*) FROM movies")
    print(f"  Movies:           {(await cursor.fetchone())[0]:,}")

    cursor = await db.execute("SELECT COUNT(*) FROM movies WHERE tmdb_id IS NOT NULL")
    print(f"  With TMDB ID:     {(await cursor.fetchone())[0]:,}")

    cursor = await db.execute("SELECT COUNT(*) FROM trailers")
    print(f"  Total trailers:   {(await cursor.fetchone())[0]:,}")

    cursor = await db.execute("SELECT COUNT(DISTINCT youtube_id) FROM trailers")
    print(f"  Unique YouTube:   {(await cursor.fetchone())[0]:,}")

    cursor = await db.execute("SELECT COUNT(DISTINCT movie_id) FROM trailers")
    print(f"  Movies w/trailer: {(await cursor.fetchone())[0]:,}")

    cursor = await db.execute("SELECT COUNT(DISTINCT language) FROM trailers WHERE language IS NOT NULL")
    print(f"  Languages:        {(await cursor.fetchone())[0]:,}")

    # Series stats
    print()
    try:
        cursor = await db.execute("SELECT COUNT(*) FROM series")
        print(f"  Series:           {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute("SELECT COUNT(*) FROM series_trailers")
        print(f"  Series trailers:  {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute("SELECT COUNT(DISTINCT youtube_id) FROM series_trailers")
        print(f"  Series unique YT: {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute("SELECT COUNT(DISTINCT series_id) FROM series_trailers")
        print(f"  Series w/trailer: {(await cursor.fetchone())[0]:,}")
    except Exception:
        print("  Series:           (tables not created yet)")

    # Subtitle & audio stats
    print()
    try:
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_subtitles WHERE language != '__unavailable__' AND language != '__error__'"
        )
        print(f"  Videos w/subs:    {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute(
            "SELECT COUNT(*) FROM trailer_subtitles WHERE is_auto_generated = 0 AND language != '__unavailable__' AND language != '__error__'"
        )
        print(f"  Manual sub tracks:{(await cursor.fetchone())[0]:>8,}")

        cursor = await db.execute(
            "SELECT COUNT(*) FROM trailer_subtitles WHERE is_auto_generated = 1"
        )
        print(f"  Auto sub tracks:  {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_audio_tracks"
        )
        print(f"  Videos w/audio:   {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute(
            """SELECT COUNT(*) FROM (
                 SELECT youtube_id FROM trailer_audio_tracks
                 GROUP BY youtube_id HAVING COUNT(*) > 1
               )"""
        )
        print(f"  Multi-audio vids: {(await cursor.fetchone())[0]:,}")

        cursor = await db.execute("SELECT COUNT(*) FROM trailer_formats")
        print(f"  Format entries:   {(await cursor.fetchone())[0]:,}")
    except Exception:
        print("  Subtitles/Audio:  (tables not created yet)")

    # Trailer type breakdown
    cursor = await db.execute(
        "SELECT trailer_type, COUNT(*) as cnt FROM trailers GROUP BY trailer_type ORDER BY cnt DESC"
    )
    rows = await cursor.fetchall()
    if rows:
        print("\n  By type:")
        for r in rows:
            print(f"    {r['trailer_type']:20s} {r['cnt']:>10,}")

    # Language breakdown (top 20)
    cursor = await db.execute(
        "SELECT language, COUNT(*) as cnt FROM trailers WHERE language IS NOT NULL GROUP BY language ORDER BY cnt DESC LIMIT 20"
    )
    rows = await cursor.fetchall()
    if rows:
        print("\n  By language (top 20):")
        for r in rows:
            print(f"    {r['language']:5s} {r['cnt']:>10,}")

    # Comment & sentiment stats
    print()
    try:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM trailer_comments WHERE text != '__comments_disabled__'"
        )
        total_comments = (await cursor.fetchone())[0]
        print(f"  Total comments:   {total_comments:,}")

        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_comments WHERE text != '__comments_disabled__'"
        )
        print(f"  Videos w/comments:{(await cursor.fetchone())[0]:>8,}")

        cursor = await db.execute(
            "SELECT COUNT(DISTINCT youtube_id) FROM trailer_comments WHERE text = '__comments_disabled__'"
        )
        print(f"  Comments disabled:{(await cursor.fetchone())[0]:>8,}")

        cursor = await db.execute(
            """SELECT sentiment, COUNT(*) as cnt FROM trailer_comments
               WHERE sentiment IS NOT NULL AND text != '__comments_disabled__'
               GROUP BY sentiment ORDER BY cnt DESC"""
        )
        rows = await cursor.fetchall()
        if rows:
            print("\n  Sentiment breakdown:")
            for r in rows:
                print(f"    {r['sentiment']:12s} {r['cnt']:>10,}")
    except Exception:
        print("  Comments:         (table not created yet)")

    print()
    await db.close()


COMMANDS = {
    "phase0": cmd_phase0,
    "phase1": cmd_phase1,
    "phase2a": cmd_phase2a,
    "phase2b": cmd_phase2b,
    "phase3": cmd_phase3,
    "phase4": cmd_phase4,
    "phase5": cmd_phase5,
    "phase6": cmd_phase6,
    "phase7": cmd_phase7,
    "phase7a": cmd_phase7a,
    "phase8": cmd_phase8,
    "phase8a": cmd_phase8a,
    "phase9": cmd_phase9,
    "analytics": cmd_analytics,
    "group-trailers": cmd_group_trailers,
    "daily-update": cmd_daily_update,
    "all": cmd_all,
    "status": cmd_status,
    "stats": cmd_stats,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("Usage: python -m pipeline.run <command>")
        print()
        print("Commands:")
        print("  phase0   Bootstrap: parse TSV, initialize database")
        print("  phase1   Resolve IMDb IDs to TMDB IDs")
        print("  phase2a  Collect English trailers from TMDB")
        print("  phase2b  Collect multilingual trailers from TMDB")
        print("  phase3   Enrich trailers with YouTube metadata")
        print("  phase4   YouTube search gap-fill for missing trailers")
        print("  phase5   Series bootstrap: download TMDB export, load series")
        print("  phase6   Collect trailers for TV series from TMDB")
        print("  phase7   Collect subtitle/audio/format metadata (all trailers)")
        print("  phase7a  Collect subtitle/audio/format metadata (top 10K movies)")
        print("  phase8   Collect YouTube comments (all trailers)")
        print("  phase8a  Collect YouTube comments (top 10K movies)")
        print("  phase9   Sentiment analysis on collected comments")
        print("  analytics  Compute analytics (timeline + confidence + channels)")
        print("  group-trailers  Group trailers by language (same trailer, different langs)")
        print("  daily-update  Daily incremental update (new movies, series, trailers)")
        print("  all      Run phases 0-2a (minimum viable database)")
        print("  status   Show ingestion progress")
        print("  stats    Show database statistics")
        sys.exit(1)

    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    command = sys.argv[1]
    asyncio.run(COMMANDS[command]())


if __name__ == "__main__":
    main()
