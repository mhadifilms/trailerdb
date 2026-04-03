"""Phase 3: Enrich trailers with YouTube metadata (view counts, duration, etc.).

Expanded version: captures snippet, statistics, contentDetails, status, and topicDetails
to populate description, tags, category, thumbnail, comment_count, embeddable,
age-restriction, default language, and caption availability.
"""

import asyncio
import logging
import re

import aiohttp

from pipeline.config import YOUTUBE_API_KEY, YOUTUBE_BASE_URL
from pipeline.db import get_connection

logger = logging.getLogger(__name__)

BATCH_SIZE = 50  # YouTube API allows up to 50 IDs per call
DAILY_QUOTA = 10_000  # YouTube API daily quota units
DESCRIPTION_MAX_LEN = 2000


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
        "part": "snippet,statistics,contentDetails,status,topicDetails",
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
        status = item.get("status", {})

        # Description: truncate to DESCRIPTION_MAX_LEN chars
        description = snippet.get("description", "") or ""
        if len(description) > DESCRIPTION_MAX_LEN:
            description = description[:DESCRIPTION_MAX_LEN]

        # Tags: comma-separated
        tags_list = snippet.get("tags") or []
        tags = ",".join(tags_list) if tags_list else None

        # Thumbnail: prefer high, fall back to medium, then default
        thumbnails = snippet.get("thumbnails", {})
        thumbnail_url = None
        for quality in ("high", "medium", "default"):
            if quality in thumbnails:
                thumbnail_url = thumbnails[quality].get("url")
                if thumbnail_url:
                    break

        # Age restriction
        content_rating = content.get("contentRating", {})
        is_age_restricted = 1 if content_rating.get("ytRating") == "ytAgeRestricted" else 0

        # Default language: prefer defaultLanguage, fall back to defaultAudioLanguage
        default_language = snippet.get("defaultLanguage") or snippet.get("defaultAudioLanguage")

        # Caption available
        caption_available = 1 if content.get("caption") == "true" else 0

        results[vid] = {
            # Original fields
            "channel_name": snippet.get("channelTitle"),
            "channel_id": snippet.get("channelId"),
            "yt_title": snippet.get("title"),
            "duration_seconds": parse_iso8601_duration(content.get("duration")),
            "view_count": int(stats.get("viewCount", 0)) if stats.get("viewCount") else None,
            "like_count": int(stats.get("likeCount", 0)) if stats.get("likeCount") else None,
            # Expanded fields
            "description": description or None,
            "tags": tags,
            "category_id": int(snippet["categoryId"]) if snippet.get("categoryId") else None,
            "thumbnail_url": thumbnail_url,
            "comment_count": int(stats["commentCount"]) if stats.get("commentCount") else None,
            "is_embeddable": 1 if status.get("embeddable") else 0,
            "is_age_restricted": is_age_restricted,
            "default_language": default_language,
            "caption_available": caption_available,
        }

    return results


async def run():
    """Execute Phase 3: YouTube Metadata Enrichment (expanded)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 3: YouTube Metadata Enrichment (Expanded) ===")

    if not YOUTUBE_API_KEY:
        logger.error("YOUTUBE_API_KEY not set. Skipping Phase 3.")
        return

    db = await get_connection()

    # Run migrations to ensure new columns exist
    import sqlite3 as _sqlite3
    from pipeline.db import MIGRATIONS
    for migration in MIGRATIONS:
        try:
            await db.execute(migration)
        except Exception:
            pass  # Column already exists
    await db.commit()

    # Get trailers that need enrichment:
    # 1. Never enriched (channel_name IS NULL AND is_available = 1)
    # 2. Previously enriched but missing new fields (channel_name IS NOT NULL AND description IS NULL)
    cursor = await db.execute(
        """SELECT DISTINCT youtube_id FROM trailers
           WHERE is_available = 1
             AND (channel_name IS NULL OR description IS NULL)
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
                                duration_seconds = ?, view_count = ?, like_count = ?,
                                description = ?, tags = ?, category_id = ?,
                                thumbnail_url = ?, comment_count = ?,
                                is_embeddable = ?, is_age_restricted = ?,
                                default_language = ?, caption_available = ?
                               WHERE youtube_id = ?""",
                            (
                                meta["channel_name"],
                                meta["channel_id"],
                                meta["yt_title"],
                                meta["duration_seconds"],
                                meta["view_count"],
                                meta["like_count"],
                                meta["description"],
                                meta["tags"],
                                meta["category_id"],
                                meta["thumbnail_url"],
                                meta["comment_count"],
                                meta["is_embeddable"],
                                meta["is_age_restricted"],
                                meta["default_language"],
                                meta["caption_available"],
                                yt_id,
                            ),
                        )
                        enriched += 1
                    else:
                        # Video not found -- likely taken down or private
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
