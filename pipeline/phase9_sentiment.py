"""Phase 9: Basic keyword-based sentiment analysis for trailer comments.

Scores each comment as 'positive', 'negative', or 'neutral' based on
keyword/emoji matching. No ML libraries required.

Usage:
    python -m pipeline.run phase9
"""

import logging

from pipeline.db import get_connection

logger = logging.getLogger(__name__)

BATCH_SIZE = 1000

POSITIVE_WORDS = {
    "amazing", "awesome", "best", "love", "great", "incredible", "perfect",
    "masterpiece", "brilliant", "beautiful", "fantastic", "epic", "goosebumps",
    "chills", "excited", "hype", "fire", "can't wait", "hyped", "wonderful",
    "outstanding", "magnificent", "superb", "phenomenal", "stunning",
    # Emojis
    "\U0001f525",  # fire
    "\u2764\ufe0f",  # red heart
    "\U0001f44f",  # clapping hands
    "\U0001f60d",  # heart eyes
    "\U0001f929",  # star-struck
    "\U0001f64c",  # raised hands
    "\U0001f4af",  # 100
}

NEGATIVE_WORDS = {
    "terrible", "worst", "awful", "boring", "trash", "garbage", "horrible",
    "disappointed", "cringe", "bad", "hate", "ugly", "ruined", "clickbait",
    "scam", "wtf", "stupid", "pathetic", "disaster", "unwatchable", "wasted",
    # Emojis
    "\U0001f44e",  # thumbs down
    "\U0001f4a9",  # poop
    "\U0001f922",  # nauseated face
    "\U0001f621",  # angry face
}


def score_sentiment(text: str) -> str:
    """Score a comment's sentiment based on keyword matching.

    Returns 'positive', 'negative', or 'neutral'.
    """
    lower = text.lower()
    pos = sum(1 for w in POSITIVE_WORDS if w in lower)
    neg = sum(1 for w in NEGATIVE_WORDS if w in lower)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


async def run():
    """Execute Phase 9: Sentiment Analysis on collected comments."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("=== Phase 9: Comment Sentiment Analysis ===")

    db = await get_connection()

    # Count comments needing sentiment scoring
    cursor = await db.execute(
        """SELECT COUNT(*) FROM trailer_comments
           WHERE sentiment IS NULL
             AND text != '__comments_disabled__'"""
    )
    total = (await cursor.fetchone())[0]
    logger.info(f"Found {total:,} comments to score")

    if total == 0:
        logger.info("Nothing to score. Phase 9 complete.")
        await db.close()
        return

    scored = 0
    positive = 0
    negative = 0
    neutral = 0

    while True:
        cursor = await db.execute(
            """SELECT id, text FROM trailer_comments
               WHERE sentiment IS NULL
                 AND text != '__comments_disabled__'
               LIMIT ?""",
            (BATCH_SIZE,),
        )
        rows = await cursor.fetchall()

        if not rows:
            break

        for row in rows:
            sentiment = score_sentiment(row["text"])
            await db.execute(
                "UPDATE trailer_comments SET sentiment = ? WHERE id = ?",
                (sentiment, row["id"]),
            )
            scored += 1
            if sentiment == "positive":
                positive += 1
            elif sentiment == "negative":
                negative += 1
            else:
                neutral += 1

        await db.commit()

        if scored % 10000 == 0 or scored >= total:
            logger.info(
                f"Scored: {scored:,}/{total:,} | "
                f"Positive: {positive:,} | Negative: {negative:,} | Neutral: {neutral:,}"
            )

    await db.commit()
    logger.info(
        f"=== Phase 9 complete: {scored:,} comments scored | "
        f"Positive: {positive:,} ({positive / max(scored, 1) * 100:.1f}%) | "
        f"Negative: {negative:,} ({negative / max(scored, 1) * 100:.1f}%) | "
        f"Neutral: {neutral:,} ({neutral / max(scored, 1) * 100:.1f}%) ==="
    )
    await db.close()
