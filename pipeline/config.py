import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = os.getenv("DB_PATH", str(PROJECT_ROOT / "db" / "trailerdb.db"))
DATA_DIR = PROJECT_ROOT / "data"
MOVIES_TSV = DATA_DIR / "movies.tsv"

# TMDB
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_EXPORT_URL = "https://files.tmdb.org/p/exports"
TMDB_RATE_LIMIT = int(os.getenv("TMDB_RATE_LIMIT", "30"))
TMDB_MAX_RETRIES = int(os.getenv("TMDB_MAX_RETRIES", "3"))

# YouTube
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_BASE_URL = "https://www.googleapis.com/youtube/v3"

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Multilingual tiers
TIER1_LANGUAGES = ["es", "fr", "de", "ja"]
TIER2_LANGUAGES = ["pt", "ko", "zh", "it", "ru", "hi", "ar", "nl", "pl", "tr"]
TIER3_LANGUAGES = ["sv", "da", "no", "fi", "cs", "hu", "ro", "th", "id", "vi", "uk", "el", "he", "ms", "tl"]

TIER2_MAX_RANK = 50_000
TIER3_MAX_RANK = 10_000
