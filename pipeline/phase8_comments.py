"""Phase 8: Collect top-level YouTube comments for trailers.

Fetches up to 20 top comments per video using commentThreads API.
Costs 1 quota unit per call. At 10K/day = 10K videos/day.

Processes videos ordered by view_count DESC (most popular first).
Skips videos that already have comments in the trailer_comments table.

Usage:
    python -m pipeline.run phase8     # All trailers
    python -m pipeline.run phase8a    # Top 10K movies only
"""

import asyncio
import logging

import aiohttp

from pipeline.config import YOUTUBE_API_KEY, YOUTUBE_BASE_URL
from pipeline.db import get_connection

logger = logging.getLogger(__name__)

DAILY_QUOTA = 10_000  # YouTube API daily quota units
MAX_COMMENTS_PER_VIDEO = 20
COMMIT_EVERY = 100


async def fetch_comments(
    session: aiohttp.ClientSession,
    youtube_id: str,
) -> list[dict] | None:
    """Fetch top-level comments for a single YouTube video.

    Returns list of comment dicts, or None if comments are disabled/unavailable.
    """
    url = f"{YOUTUBE_BASE_URL}/commentThreads"
    params = {
        "key": YOUTUBE_API_KEY,
        "videoId": youtube_id,
        "part": "snippet",
        "order": "relevance",
        "maxResults": MAX_COMMENTS_PER_VIDEO,
        "textFormat": "plainText",
    }

    async with session.get(url, params=params) as resp:
        if resp.status == 403:
            # Could be quota exceeded or comments disabled
            data = await resp.json()
            errors = data.get("error", {}).get("errors", [])
            for err in errors:
                reason = err.get("reason", "")
                if reason in ("commentsDisabled", "forbidden"):
                    return None  # Comments disabled on this video
                if reason in ("quotaExceeded", "rateLimitExceeded"):
                    raise Exception("YouTube API quota exceeded")
            # Unknown 403
            logger.warning(f"403 for {youtube_id}: {data}")
            return None

        if resp.status == 404:
            return None  # Video not found

        if resp.status == 429:
            raise Exception("YouTube API rate limit (429)")

        if resp.status != 200:
            logger.warning(f"HTTP {resp.status} for {youtube_id}")
            return None

        data = await resp.json()

    comments = []
    for item in data.get("items", []):
        thread_snippet = item.get("snippet", {})
        top_comment = thread_snippet.get("topLevelComment", {})
        comment_snippet = top_comment.get("snippet", {})

        author_channel = comment_snippet.get("authorChannelId", {})
        author_channel_id = author_channel.get("value") if isinstance(author_channel, dict) else None

        comments.append({
            "comment_id": top_comment.get("id", ""),
            "author": comment_snippet.get("authorDisplayName"),
            "author_channel_id": author_channel_id,
            "text": comment_snippet.get("textDisplay", ""),
            "like_count": int(comment_snippet.get("likeCount", 0)),
            "reply_count": int(thread_snippet.get("totalReplyCount", 0)),
            "published_at": comment_snippet.get("publishedAt"),
        })

    return comments


async def run(top_n: int | None = None):
    """Execute Phase 8: YouTube Comment Collection.

    Args:
        top_n: If set, only process trailers for the top N movies by IMDb votes.
    """
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 8: YouTube Comment Collection ===")

    if top_n:
        logger.info(f"Mode: Top {top_n:,} movies by IMDb votes")

    if not YOUTUBE_API_KEY:
        logger.error("YOUTUBE_API_KEY not set. Skipping Phase 8.")
        return

    db = await get_connection()

    # Ensure trailer_comments table exists
    from pipeline.db import SCHEMA
    await db.executescript(SCHEMA)

    # Get YouTube IDs to process: skip videos that already have comments.
    # Order by view_count DESC to get the most popular first.
    if top_n:
        query = """
            SELECT DISTINCT t.youtube_id
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_comments tc ON tc.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND tc.id IS NULL
              AND t.view_count IS NOT NULL
              AND m.imdb_votes IS NOT NULL
            ORDER BY m.imdb_votes DESC
        """
        cursor = await db.execute(query)
        rows = await cursor.fetchall()

        # Limit by distinct movies
        filtered_ids = []
        seen_movies_query = """
            SELECT DISTINCT t.youtube_id, t.movie_id
            FROM trailers t
            JOIN movies m ON m.id = t.movie_id
            LEFT JOIN trailer_comments tc ON tc.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND tc.id IS NULL
              AND t.view_count IS NOT NULL
              AND m.imdb_votes IS NOT NULL
            ORDER BY m.imdb_votes DESC
        """
        cursor = await db.execute(seen_movies_query)
        rows_with_movies = await cursor.fetchall()
        seen_movies = set()
        for r in rows_with_movies:
            mid = r["movie_id"]
            if mid not in seen_movies:
                seen_movies.add(mid)
            if len(seen_movies) <= top_n:
                filtered_ids.append(r["youtube_id"])
            else:
                break
        all_ids = filtered_ids
    else:
        query = """
            SELECT DISTINCT t.youtube_id
            FROM trailers t
            LEFT JOIN trailer_comments tc ON tc.youtube_id = t.youtube_id
            WHERE t.is_available = 1
              AND tc.id IS NULL
            ORDER BY t.view_count DESC NULLS LAST
        """
        cursor = await db.execute(query)
        rows = await cursor.fetchall()
        all_ids = [r["youtube_id"] for r in rows]

    logger.info(f"Found {len(all_ids):,} YouTube videos to collect comments for")

    if not all_ids:
        logger.info("Nothing to process. Phase 8 complete.")
        await db.close()
        return

    quota_used = 0
    collected = 0
    skipped = 0
    total_comments = 0

    async with aiohttp.ClientSession() as session:
        for i, youtube_id in enumerate(all_ids):
            if quota_used >= DAILY_QUOTA:
                logger.warning(
                    f"Daily quota limit reached ({quota_used} units). "
                    f"Stopping. Resume tomorrow."
                )
                break

            try:
                comments = await fetch_comments(session, youtube_id)
                quota_used += 1

                if comments is None:
                    # Comments disabled or video unavailable -- insert sentinel
                    # so we don't retry
                    await db.execute(
                        """INSERT OR IGNORE INTO trailer_comments
                           (youtube_id, comment_id, text)
                           VALUES (?, ?, ?)""",
                        (youtube_id, f"__disabled__{youtube_id}", "__comments_disabled__"),
                    )
                    skipped += 1
                else:
                    for comment in comments:
                        if not comment["comment_id"]:
                            continue
                        await db.execute(
                            """INSERT OR IGNORE INTO trailer_comments
                               (youtube_id, comment_id, author, author_channel_id,
                                text, like_count, reply_count, published_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                youtube_id,
                                comment["comment_id"],
                                comment["author"],
                                comment["author_channel_id"],
                                comment["text"],
                                comment["like_count"],
                                comment["reply_count"],
                                comment["published_at"],
                            ),
                        )
                    total_comments += len(comments)
                    collected += 1

                # Periodic commit and logging
                processed = collected + skipped
                if processed % COMMIT_EVERY == 0:
                    await db.commit()

                if processed % 500 == 0 or processed == len(all_ids):
                    logger.info(
                        f"Progress: {processed:,}/{len(all_ids):,} | "
                        f"Collected: {collected:,} | Skipped: {skipped:,} | "
                        f"Comments: {total_comments:,} | "
                        f"Quota: {quota_used:,}/{DAILY_QUOTA:,}"
                    )

            except Exception as e:
                error_msg = str(e).lower()
                if "quota" in error_msg or "rate limit" in error_msg:
                    logger.warning(f"Quota/rate limit hit: {e}")
                    # Back off and retry
                    await asyncio.sleep(10)
                    # Check if it's truly exhausted
                    if "quota exceeded" in error_msg:
                        logger.error("Quota exhausted. Stopping.")
                        break
                else:
                    logger.error(f"Error fetching comments for {youtube_id}: {e}")
                    await asyncio.sleep(1)

    await db.commit()
    logger.info(
        f"=== Phase 8 complete: {collected:,} videos with comments, "
        f"{skipped:,} skipped, {total_comments:,} total comments, "
        f"{quota_used:,} quota units used ==="
    )
    await db.close()
