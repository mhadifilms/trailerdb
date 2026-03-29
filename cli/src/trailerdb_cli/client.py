"""HTTP client for the TrailerDB static JSON API."""

from __future__ import annotations

import os
from typing import Any

import click
import httpx

DEFAULT_BASE_URL = "https://trailerdb.com/data"

# Index fields (compact array-of-arrays format):
#   0: imdb_id, 1: title, 2: year, 3: rating, 4: votes,
#   5: poster, 6: genre_ids, 7: tmdb_id, 8: slug, 9: trailer_count, 10: popularity
IDX_IMDB_ID = 0
IDX_TITLE = 1
IDX_YEAR = 2
IDX_RATING = 3
IDX_VOTES = 4
IDX_POSTER = 5
IDX_GENRE_IDS = 6
IDX_TMDB_ID = 7
IDX_SLUG = 8
IDX_TRAILER_COUNT = 9
IDX_POPULARITY = 10


class TrailerDBClient:
    """Client for fetching data from the TrailerDB static JSON API."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (
            base_url
            or os.environ.get("TRAILERDB_API_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")
        self._index_cache: dict[str, Any] | None = None
        self._client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "trailerdb-cli/0.1.0"},
        )

    def close(self) -> None:
        self._client.close()

    def _get_json(self, path: str) -> Any:
        """Fetch JSON from a relative API path."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.json()

    def get_index(self) -> dict[str, Any]:
        """Fetch and cache the browse index."""
        if self._index_cache is None:
            self._index_cache = self._get_json("index.json")
        return self._index_cache

    def get_movies(self) -> list[list]:
        """Return the movies array from the browse index."""
        return self.get_index()["movies"]

    def get_genres(self) -> dict[str, str]:
        """Return the genre id-to-name mapping from the index."""
        return self.get_index()["genres"]

    def get_movie_detail(self, imdb_id: str) -> dict[str, Any]:
        """Fetch a single movie's detail JSON by IMDb ID."""
        return self._get_json(f"movie/{imdb_id}.json")

    def get_stats(self) -> dict[str, Any]:
        """Fetch the site-wide stats JSON."""
        return self._get_json("stats.json")

    def search_index(self, query: str, limit: int = 10) -> list[list]:
        """Fuzzy-search the index by movie title.

        Uses a simple scoring approach:
          - Exact substring match (case-insensitive) scores highest
          - Word-start matches score next
          - Partial character-sequence matches score last
        Results are sorted by score descending, then by votes descending.
        """
        movies = self.get_movies()
        query_lower = query.lower()
        query_words = query_lower.split()
        scored: list[tuple[float, list]] = []

        for movie in movies:
            title = movie[IDX_TITLE]
            if title is None:
                continue
            title_lower = title.lower()

            score = 0.0

            # Exact title match
            if title_lower == query_lower:
                score = 100.0
            # Full query is a substring
            elif query_lower in title_lower:
                # Bonus if it starts the title
                if title_lower.startswith(query_lower):
                    score = 90.0
                else:
                    score = 80.0
            else:
                # Check how many query words appear in the title
                matches = sum(1 for w in query_words if w in title_lower)
                if matches > 0:
                    score = 50.0 * (matches / len(query_words))
                else:
                    # Character-sequence fuzzy match
                    score = _fuzzy_score(query_lower, title_lower)

            if score > 0:
                scored.append((score, movie))

        # Sort by score desc, then votes desc
        scored.sort(key=lambda x: (x[0], x[1][IDX_VOTES] or 0), reverse=True)
        return [m for _, m in scored[:limit]]

    def resolve_identifier(self, identifier: str) -> str:
        """Resolve an identifier to an IMDb ID.

        If the identifier looks like an IMDb ID (starts with 'tt'), return it.
        Otherwise, search the index and return the best match's IMDb ID.
        """
        if identifier.startswith("tt") and identifier[2:].isdigit():
            return identifier
        results = self.search_index(identifier, limit=1)
        if not results:
            raise click.ClickException(f"No movie found matching '{identifier}'")
        return results[0][IDX_IMDB_ID]


def _fuzzy_score(query: str, target: str) -> float:
    """Simple character-sequence fuzzy matching score (0-40)."""
    qi = 0
    matched = 0
    for char in target:
        if qi < len(query) and char == query[qi]:
            matched += 1
            qi += 1
    if matched == 0:
        return 0.0
    ratio = matched / len(query)
    if ratio < 0.6:
        return 0.0
    return ratio * 40.0
