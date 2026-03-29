import re

# Patterns to detect sub-types from TMDB video names
_TV_SPOT = re.compile(r"\btv\s*spot\b", re.IGNORECASE)
_RED_BAND = re.compile(r"\bred\s*band\b", re.IGNORECASE)
_IMAX = re.compile(r"\bimax\b", re.IGNORECASE)

# TMDB type → our trailer_type mapping
_TYPE_MAP = {
    "Trailer": "trailer",
    "Teaser": "teaser",
    "Clip": "clip",
    "Behind the Scenes": "behind_the_scenes",
    "Featurette": "featurette",
    "Bloopers": "bloopers",
    "Opening Credits": "opening_credits",
}


def classify_trailer_type(tmdb_type: str, name: str) -> str:
    """Classify a TMDB video into a trailer_type.

    For videos with type "Trailer", we check the name for sub-types
    like TV Spots, Red Band trailers, and IMAX trailers.
    """
    if tmdb_type == "Trailer":
        if _TV_SPOT.search(name):
            return "tv_spot"
        if _RED_BAND.search(name):
            return "red_band"
        if _IMAX.search(name):
            return "imax"
        return "trailer"

    return _TYPE_MAP.get(tmdb_type, "trailer")
