"""Phase 3: Enrich trailers with YouTube metadata (view counts, duration, etc.)."""

import asyncio
import logging
import re

import aiohttp

from pipeline.config import YOUTUBE_API_KEY, YOUTUBE_BASE_URL
from pipeline.db import get_connection

logger = logging.getLogger(__name__)

BATCH_SIZE = 50  # YouTube API allows up to 50 IDs per call
DAILY_QUOTA = 10_000  # YouTube API daily quota units


def parse_iso8601_duration(duration: str) -> int | None:
    """Parse ISO 8601 duration (PT1H2M3S) to total seconds."""
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration or "")
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


async def fetch_youtube_metadata(
    session: aiohttp.ClientSession,
    youtube_ids: list[str],
) -> dict[str, dict]:
    """Fetch metadata for up to 50 YouTube videos. Returns {youtube_id: metadata}."""
    url = f"{YOUTUBE_BASE_URL}/videos"
    params = {
        "key": YOUTUBE_API_KEY,
        "id": ",".join(youtube_ids),
        "part": "snippet,statistics,contentDetails",
    }

    async with session.get(url, params=params) as resp:
        if resp.status == 403:
            raise Exception("YouTube API quota exceeded")
        if resp.status != 200:
            raise Exception(f"YouTube API HTTP {resp.status}")

        data = await resp.json()

    results = {}
    for item in data.get("items", []):
        vid = item["id"]
        snippet = item.get("snippet", {})
        stats = item.get("statistics", {})
        content = item.get("contentDetails", {})

        results[vid] = {
            "channel_name": snippet.get("channelTitle"),
            "channel_id": snippet.get("channelId"),
            "yt_title": snippet.get("title"),
            "duration_seconds": parse_iso8601_duration(content.get("duration")),
            "view_count": int(stats.get("viewCount", 0)) if stats.get("viewCount") else None,
            "like_count": int(stats.get("likeCount", 0)) if stats.get("likeCount") else None,
        }

    return results


async def run():
    """Execute Phase 3: YouTube Metadata Enrichment."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 3: YouTube Metadata Enrichment ===")

    if not YOUTUBE_API_KEY:
        logger.error("YOUTUBE_API_KEY not set. Skipping Phase 3.")
        return

    db = await get_connection()

    # Get all YouTube IDs that haven't been enriched yet
    cursor = await db.execute(
        """SELECT DISTINCT youtube_id FROM trailers
           WHERE channel_name IS NULL AND is_available = 1
           ORDER BY id"""
    )
    rows = await cursor.fetchall()
    all_ids = [r["youtube_id"] for r in rows]

    logger.info(f"Found {len(all_ids):,} YouTube videos to enrich")

    if not all_ids:
        logger.info("Nothing to enrich. Phase 3 complete.")
        await db.close()
        return

    # Process in batches of 50
    total_batches = (len(all_ids) + BATCH_SIZE - 1) // BATCH_SIZE
    quota_used = 0
    enriched = 0
    unavailable = 0

    async with aiohttp.ClientSession() as session:
        for i in range(0, len(all_ids), BATCH_SIZE):
            batch = all_ids[i : i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1

            if quota_used >= DAILY_QUOTA:
                logger.warning(f"Daily quota limit reached ({quota_used} units). Stopping. Resume tomorrow.")
                break

            try:
                metadata = await fetch_youtube_metadata(session, batch)
                quota_used += 1  # videos.list costs 1 unit per call

                # Update trailers with metadata
                for yt_id in batch:
                    if yt_id in metadata:
                        meta = metadata[yt_id]
                        await db.execute(
                            """UPDATE trailers SET
                                channel_name = ?, channel_id = ?, yt_title = ?,
                                duration_seconds = ?, view_count = ?, like_count = ?
                               WHERE youtube_id = ?""",
                            (
                                meta["channel_name"],
                                meta["channel_id"],
                                meta["yt_title"],
                                meta["duration_seconds"],
                                meta["view_count"],
                                meta["like_count"],
                                yt_id,
                            ),
                        )
                        enriched += 1
                    else:
                        # Video not found — likely taken down or private
                        await db.execute(
                            "UPDATE trailers SET is_available = 0 WHERE youtube_id = ?",
                            (yt_id,),
                        )
                        unavailable += 1

                if batch_num % 100 == 0:
                    await db.commit()
                    logger.info(
                        f"Batch {batch_num:,}/{total_batches:,} | "
                        f"Enriched: {enriched:,} | Unavailable: {unavailable:,} | "
                        f"Quota used: {quota_used:,}/{DAILY_QUOTA:,}"
                    )

            except Exception as e:
                logger.error(f"Batch {batch_num} failed: {e}")
                if "quota" in str(e).lower():
                    break
                await asyncio.sleep(1)

    await db.commit()
    logger.info(
        f"=== Phase 3 complete: {enriched:,} enriched, {unavailable:,} unavailable, "
        f"{quota_used:,} quota units used ==="
    )
    await db.close()
