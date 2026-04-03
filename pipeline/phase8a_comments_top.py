"""Phase 8a: Comment collection for top 10,000 movies only.

A convenience wrapper that collects comments for trailers of the top 10,000
movies by IMDb votes. This is the recommended first run since it covers
the most important content.

Usage:
    python -m pipeline.run phase8a   # Top 10K movies only
    python -m pipeline.run phase8    # All trailers
"""

import logging

from pipeline.phase8_comments import run as run_phase8

logger = logging.getLogger(__name__)

TOP_N = 10_000


async def run():
    """Execute Phase 8a: Comments for top 10K movies."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info(f"=== Phase 8a: Top {TOP_N:,} Movies -- Comment Collection ===")
    await run_phase8(top_n=TOP_N)
