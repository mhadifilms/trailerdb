"""Phase 7a: Subtitle & Audio Track collection for top 10,000 movies only.

A convenience wrapper that processes trailers for the top 10,000 movies
by IMDb votes. This is the recommended first run since it covers the
most important content.

Usage:
    python -m pipeline.run phase7a   # Top 10K movies only (~15K trailers, ~8-12 hours)
    python -m pipeline.run phase7    # All trailers (~228K, ~5+ days)
"""

import logging

from pipeline.phase7_subtitle_audio import run as run_phase7

logger = logging.getLogger(__name__)

TOP_N = 10_000


async def run():
    """Execute Phase 7a: Subtitle & Audio for top 10K movies."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info(f"=== Phase 7a: Top {TOP_N:,} Movies — Subtitle & Audio Collection ===")
    await run_phase7(top_n=TOP_N)
