import aiosqlite
import sqlite3
from pathlib import Path
from pipeline.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imdb_id TEXT NOT NULL UNIQUE,
  tmdb_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  imdb_rating REAL,
  imdb_votes INTEGER,
  tmdb_popularity REAL,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  runtime INTEGER,
  original_language TEXT,
  priority_rank INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies(id),
  genre_id INTEGER NOT NULL REFERENCES genres(id),
  PRIMARY KEY (movie_id, genre_id)
);

CREATE TABLE IF NOT EXISTS trailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL REFERENCES movies(id),
  youtube_id TEXT NOT NULL,
  title TEXT,
  trailer_type TEXT NOT NULL,
  language TEXT,
  region TEXT,
  is_official INTEGER DEFAULT 1,
  quality INTEGER,
  published_at TEXT,
  source TEXT DEFAULT 'tmdb',
  channel_name TEXT,
  channel_id TEXT,
  duration_seconds INTEGER,
  view_count INTEGER,
  like_count INTEGER,
  yt_title TEXT,
  is_available INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(movie_id, youtube_id)
);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase TEXT NOT NULL,
  imdb_id TEXT NOT NULL,
  language TEXT,
  status TEXT NOT NULL,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_movies_imdb ON movies(imdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_priority ON movies(priority_rank);
CREATE INDEX IF NOT EXISTS idx_trailers_movie ON trailers(movie_id);
CREATE INDEX IF NOT EXISTS idx_trailers_youtube ON trailers(youtube_id);
CREATE INDEX IF NOT EXISTS idx_trailers_type ON trailers(trailer_type);
CREATE INDEX IF NOT EXISTS idx_trailers_language ON trailers(language);
CREATE INDEX IF NOT EXISTS idx_trailers_movie_lang ON trailers(movie_id, language);
CREATE INDEX IF NOT EXISTS idx_log_phase_status ON ingestion_log(phase, status);
CREATE INDEX IF NOT EXISTS idx_log_imdb ON ingestion_log(imdb_id);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  original_name TEXT,
  first_air_date TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  status TEXT,
  number_of_seasons INTEGER,
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  original_language TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS series_trailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES series(id),
  youtube_id TEXT NOT NULL,
  title TEXT,
  trailer_type TEXT NOT NULL,
  language TEXT,
  region TEXT,
  is_official INTEGER DEFAULT 1,
  quality INTEGER,
  published_at TEXT,
  source TEXT DEFAULT 'tmdb',
  channel_name TEXT,
  channel_id TEXT,
  duration_seconds INTEGER,
  view_count INTEGER,
  like_count INTEGER,
  yt_title TEXT,
  is_available INTEGER DEFAULT 1,
  season_number INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(series_id, youtube_id)
);

CREATE TABLE IF NOT EXISTS series_genres (
  series_id INTEGER NOT NULL REFERENCES series(id),
  genre_id INTEGER NOT NULL REFERENCES genres(id),
  PRIMARY KEY (series_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_series_tmdb ON series(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_series_popularity ON series(popularity);
CREATE INDEX IF NOT EXISTS idx_series_trailers_series ON series_trailers(series_id);
CREATE INDEX IF NOT EXISTS idx_series_trailers_youtube ON series_trailers(youtube_id);
CREATE INDEX IF NOT EXISTS idx_series_trailers_type ON series_trailers(trailer_type);
CREATE INDEX IF NOT EXISTS idx_series_trailers_language ON series_trailers(language);
CREATE INDEX IF NOT EXISTS idx_series_trailers_series_lang ON series_trailers(series_id, language);

CREATE TABLE IF NOT EXISTS trailer_subtitles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  youtube_id TEXT NOT NULL,
  language TEXT NOT NULL,
  is_auto_generated INTEGER NOT NULL,
  formats TEXT,
  UNIQUE(youtube_id, language, is_auto_generated)
);

CREATE TABLE IF NOT EXISTS trailer_audio_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  youtube_id TEXT NOT NULL,
  language TEXT NOT NULL,
  is_original INTEGER NOT NULL,
  is_auto_dubbed INTEGER,
  display_name TEXT,
  UNIQUE(youtube_id, language)
);

CREATE TABLE IF NOT EXISTS trailer_formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  youtube_id TEXT NOT NULL,
  format_id TEXT,
  height INTEGER,
  width INTEGER,
  vcodec TEXT,
  acodec TEXT,
  fps REAL,
  filesize INTEGER,
  UNIQUE(youtube_id, format_id)
);

CREATE TABLE IF NOT EXISTS trailer_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  trailer_type TEXT NOT NULL,
  canonical_title TEXT,
  published_at TEXT,
  languages TEXT,
  trailer_count INTEGER DEFAULT 1,
  UNIQUE(movie_id, id)
);

CREATE INDEX IF NOT EXISTS idx_trailer_groups_movie ON trailer_groups(movie_id);

CREATE INDEX IF NOT EXISTS idx_subs_youtube ON trailer_subtitles(youtube_id);
CREATE INDEX IF NOT EXISTS idx_subs_lang ON trailer_subtitles(language);
CREATE INDEX IF NOT EXISTS idx_subs_movie ON trailer_subtitles(movie_id);
CREATE INDEX IF NOT EXISTS idx_audio_youtube ON trailer_audio_tracks(youtube_id);
CREATE INDEX IF NOT EXISTS idx_audio_lang ON trailer_audio_tracks(language);
CREATE INDEX IF NOT EXISTS idx_formats_youtube ON trailer_formats(youtube_id);
"""


MIGRATIONS = [
    "ALTER TABLE movies ADD COLUMN release_date TEXT",
    "ALTER TABLE trailers ADD COLUMN days_before_release INTEGER",
    "ALTER TABLE trailers ADD COLUMN confidence INTEGER",
    "ALTER TABLE trailers ADD COLUMN trailer_group_id INTEGER",
]


def init_db_sync():
    """Create database and schema synchronously (for bootstrap)."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    # Run migrations (safe to re-run; SQLite errors if column already exists)
    for migration in MIGRATIONS:
        try:
            conn.execute(migration)
        except sqlite3.OperationalError:
            pass  # Column already exists
    conn.commit()
    conn.close()


async def get_connection() -> aiosqlite.Connection:
    """Get an async database connection with optimized settings."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA synchronous=NORMAL")
    await db.execute("PRAGMA cache_size=-64000")  # 64MB cache
    return db
