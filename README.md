# TrailerDB

The Trailer Database — an open-source database of every trailer for every movie, in every language.

## What is this?

TrailerDB is a comprehensive database mapping 336,627 movies to their trailers on YouTube. It collects:

- **Every trailer type**: theatrical, teaser, TV spots, red band, IMAX, behind the scenes, featurettes, clips, bloopers
- **Every language**: trailers in 30+ languages via a tiered collection strategy
- **YouTube metadata**: view counts, channel names, duration, availability status

The database is built by ingesting data from TMDB (The Movie Database) and enriching it with YouTube metadata.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/yourusername/trailerdb.git
cd trailerdb
pip install -r requirements.txt

# 2. Configure API keys
cp .env.example .env
# Edit .env with your TMDB and YouTube API keys

# 3. Bootstrap the database (no API calls needed)
python -m pipeline.run phase0

# 4. Resolve TMDB IDs (~3 hours for all 337K movies)
python -m pipeline.run phase1

# 5. Collect English trailers (~3 hours)
python -m pipeline.run phase2a

# 6. Check progress at any time
python -m pipeline.run status
python -m pipeline.run stats
```

## Pipeline Phases

| Phase | Description | Duration | API |
|-------|-------------|----------|-----|
| **0** | Parse movie list, initialize database | ~2 min | None |
| **1** | Resolve IMDb IDs to TMDB IDs | ~3 hours | TMDB Find |
| **2a** | Collect English trailers | ~3 hours | TMDB Videos |
| **2b** | Collect multilingual trailers (30 languages) | ~20 hours | TMDB Videos |
| **3** | Enrich with YouTube metadata | ~1-2 days | YouTube Data v3 |
| **4** | YouTube search for movies missing trailers | Ongoing | YouTube Search |

All phases are **fully resumable** — you can stop and restart at any point.

## API Keys

- **TMDB**: Free at [themoviedb.org](https://www.themoviedb.org/settings/api)
- **YouTube Data API v3**: Free at [Google Cloud Console](https://console.cloud.google.com/) (10,000 units/day)

## Database Schema

The output is a SQLite database (`db/trailerdb.db`) with these main tables:

- `movies` — 336,627 movies with IMDb/TMDB IDs, ratings, metadata
- `trailers` — YouTube trailer links with type, language, region, metadata
- `genres` / `movie_genres` — Genre classification
- `ingestion_log` — Pipeline progress tracking

## Multilingual Strategy

Trailers are collected in tiers to optimize API usage:

- **Tier 1** (all movies): English, Spanish, French, German, Japanese
- **Tier 2** (top 50K movies): Portuguese, Korean, Chinese, Italian, Russian, Hindi, Arabic, Dutch, Polish, Turkish
- **Tier 3** (top 10K movies): 15 additional languages

## License

MIT
