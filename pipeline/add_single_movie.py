"""Add a single movie to TrailerDB by its IMDb ID.

Usage:
    python -m pipeline.add_single_movie tt1234567

This standalone script:
1. Resolves the IMDb ID to a TMDB ID via the TMDB Find API
2. Fetches movie details + all videos (English and multilingual)
3. Exports a single movie JSON file to site/public/data/movie/

Designed to be run from GitHub Actions or locally for quick additions.
"""

import asyncio
import json
import logging
import re
import sys
import unicodedata
from pathlib import Path

import aiohttp

from pipeline.config import (
    TMDB_API_KEY,
    TMDB_BASE_URL,
    TIER1_LANGUAGES,
    TIER2_LANGUAGES,
)
from pipeline.type_classifier import classify_trailer_type

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "site" / "public" / "data" / "movie"


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "untitled"


def make_slug(title: str, year: int | None, imdb_id: str) -> str:
    """Generate a unique URL slug for a movie."""
    parts = [slugify(title)]
    if year:
        parts.append(str(year))
    parts.append(imdb_id)
    return "-".join(parts)


async def resolve_imdb_to_tmdb(session: aiohttp.ClientSession, imdb_id: str) -> dict | None:
    """Resolve an IMDb ID to TMDB movie data via the Find API."""
    url = f"{TMDB_BASE_URL}/find/{imdb_id}"
    params = {"api_key": TMDB_API_KEY, "external_source": "imdb_id"}

    async with session.get(url, params=params) as resp:
        if resp.status != 200:
            logger.error(f"TMDB Find API returned HTTP {resp.status}")
            return None
        data = await resp.json()
        results = data.get("movie_results", [])
        if results:
            return results[0]
        return None


async def fetch_movie_details(session: aiohttp.ClientSession, tmdb_id: int) -> dict | None:
    """Fetch full movie details + English videos from TMDB."""
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
    params = {
        "api_key": TMDB_API_KEY,
        "language": "en-US",
        "append_to_response": "videos",
    }

    async with session.get(url, params=params) as resp:
        if resp.status != 200:
            logger.error(f"TMDB Movie API returned HTTP {resp.status}")
            return None
        return await resp.json()


async def fetch_videos_for_language(
    session: aiohttp.ClientSession, tmdb_id: int, language: str
) -> list[dict]:
    """Fetch videos for a specific language."""
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}/videos"
    params = {"api_key": TMDB_API_KEY, "language": language}

    async with session.get(url, params=params) as resp:
        if resp.status != 200:
            return []
        data = await resp.json()
        return data.get("results", [])


def video_to_trailer(video: dict) -> dict | None:
    """Convert a TMDB video object to our trailer format. Returns None if not YouTube."""
    if video.get("site") != "YouTube":
        return None

    trailer_type = classify_trailer_type(video.get("type", ""), video.get("name", ""))

    return {
        "youtube_id": video["key"],
        "title": video.get("name"),
        "type": trailer_type,
        "language": video.get("iso_639_1"),
        "region": video.get("iso_3166_1"),
        "is_official": video.get("official", True),
        "published_at": video.get("published_at"),
        "quality": video.get("size"),
        "channel_name": None,
        "duration": None,
        "views": None,
    }


async def process_single_movie(imdb_id: str) -> dict | None:
    """Process a single movie end-to-end. Returns the movie detail dict or None."""
    if not TMDB_API_KEY:
        logger.error("TMDB_API_KEY is not set. Set it in .env or as an environment variable.")
        return None

    async with aiohttp.ClientSession() as session:
        # Step 1: Resolve IMDb ID to TMDB
        logger.info(f"Resolving {imdb_id} via TMDB Find API...")
        find_result = await resolve_imdb_to_tmdb(session, imdb_id)
        if not find_result:
            logger.error(f"Could not find {imdb_id} on TMDB.")
            return None

        tmdb_id = find_result["id"]
        logger.info(f"Resolved to TMDB ID: {tmdb_id} ({find_result.get('title', '?')})")

        # Step 2: Fetch full details + English videos
        logger.info("Fetching movie details and English videos...")
        details = await fetch_movie_details(session, tmdb_id)
        if not details:
            logger.error("Failed to fetch movie details.")
            return None

        title = details.get("title", "Unknown")
        year = None
        release_date = details.get("release_date")
        if release_date and len(release_date) >= 4:
            try:
                year = int(release_date[:4])
            except ValueError:
                pass

        # Collect English trailers
        all_videos = details.get("videos", {}).get("results", [])
        seen_youtube_ids: set[str] = set()
        trailers: list[dict] = []

        for video in all_videos:
            trailer = video_to_trailer(video)
            if trailer and trailer["youtube_id"] not in seen_youtube_ids:
                seen_youtube_ids.add(trailer["youtube_id"])
                trailers.append(trailer)

        # Step 3: Fetch multilingual videos
        multi_languages = TIER1_LANGUAGES + TIER2_LANGUAGES
        logger.info(f"Fetching videos for {len(multi_languages)} additional languages...")

        for lang in multi_languages:
            lang_videos = await fetch_videos_for_language(session, tmdb_id, lang)
            for video in lang_videos:
                trailer = video_to_trailer(video)
                if trailer and trailer["youtube_id"] not in seen_youtube_ids:
                    seen_youtube_ids.add(trailer["youtube_id"])
                    trailers.append(trailer)

        # Sort trailers: by type priority, then official first, then newest
        type_order = {
            "trailer": 0, "teaser": 1, "tv_spot": 2, "red_band": 3, "imax": 4,
            "clip": 5, "featurette": 6, "behind_the_scenes": 7, "bloopers": 8,
        }

        def sort_key(t: dict) -> tuple:
            # published_at is an ISO date string; reverse by negating or using empty string
            # We want newest first, so invert the string sort by flipping characters
            pub = t["published_at"] or ""
            return (
                type_order.get(t["type"], 9),
                0 if t["is_official"] else 1,
                # Negate date for descending: use a tuple that sorts in reverse
                "".join(chr(255 - ord(c)) for c in pub) if pub else "~",
            )

        trailers.sort(key=sort_key)

        # Step 4: Build genre list
        genres = [g["name"] for g in details.get("genres", [])]

        # Step 5: Assemble the detail object
        slug = make_slug(title, year, imdb_id)

        movie_detail = {
            "imdb_id": imdb_id,
            "tmdb_id": tmdb_id,
            "title": title,
            "original_title": details.get("original_title"),
            "year": year,
            "imdb_rating": None,  # Not available from TMDB
            "imdb_votes": None,
            "runtime": details.get("runtime"),
            "overview": details.get("overview"),
            "poster_path": details.get("poster_path"),
            "backdrop_path": details.get("backdrop_path"),
            "original_language": details.get("original_language"),
            "genres": genres,
            "slug": slug,
            "trailers": trailers,
        }

        return movie_detail


def export_movie_json(movie: dict) -> Path:
    """Write a single movie JSON file. Returns the output path."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / f"{movie['imdb_id']}.json"
    filepath.write_text(json.dumps(movie, separators=(",", ":")), encoding="utf-8")
    return filepath


async def main_async(imdb_id: str) -> int:
    """Main entry point. Returns exit code (0=success, 1=failure)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    logger.info(f"=== Add Single Movie: {imdb_id} ===")

    movie = await process_single_movie(imdb_id)
    if not movie:
        logger.error(f"Failed to process {imdb_id}. No movie data generated.")
        return 1

    if not movie["trailers"]:
        logger.warning(f"No trailers found for {movie['title']} ({imdb_id}).")
        return 1

    filepath = export_movie_json(movie)

    # Summary
    logger.info("=== Results ===")
    logger.info(f"Title:    {movie['title']}")
    logger.info(f"Year:     {movie['year']}")
    logger.info(f"TMDB ID:  {movie['tmdb_id']}")
    logger.info(f"Genres:   {', '.join(movie['genres'])}")
    logger.info(f"Trailers: {len(movie['trailers'])}")

    # Language breakdown
    lang_counts: dict[str, int] = {}
    for t in movie["trailers"]:
        lang = t.get("language") or "unknown"
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    lang_summary = ", ".join(f"{lang}: {count}" for lang, count in sorted(lang_counts.items()))
    logger.info(f"By lang:  {lang_summary}")

    # Type breakdown
    type_counts: dict[str, int] = {}
    for t in movie["trailers"]:
        type_counts[t["type"]] = type_counts.get(t["type"], 0) + 1
    type_summary = ", ".join(f"{t}: {c}" for t, c in sorted(type_counts.items()))
    logger.info(f"By type:  {type_summary}")

    logger.info(f"Output:   {filepath}")
    logger.info("=== Done ===")
    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m pipeline.add_single_movie <imdb_id>")
        print("Example: python -m pipeline.add_single_movie tt0468569")
        sys.exit(1)

    imdb_id = sys.argv[1].strip()
    if not re.match(r"^tt\d+$", imdb_id):
        print(f"Error: '{imdb_id}' is not a valid IMDb ID. Expected format: tt1234567")
        sys.exit(1)

    exit_code = asyncio.run(main_async(imdb_id))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
