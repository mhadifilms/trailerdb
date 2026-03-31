# TrailerDB CLI

A power-user command-line tool for browsing, analyzing, and downloading movie and TV series trailers from [TrailerDB](https://trailerdb.com).

## Installation

```bash
pip install trailerdb
```

To enable the `download` command (requires yt-dlp):

```bash
pip install 'trailerdb[download]'
```

Or install from source:

```bash
cd cli/
pip install -e .
```

## Quick Start

```bash
trailerdb search "inception"          # Search for movies
trailerdb movie tt1375666             # View movie details
trailerdb download tt1375666 --best   # Download the best trailer
trailerdb db download                 # Get the full local database
trailerdb analytics                   # View the analytics dashboard
```

## Commands

### Search

```bash
trailerdb search "the dark knight"
trailerdb search "inception" --limit 5
trailerdb search "breaking bad" --type series
trailerdb search "stranger things" --type all --json
```

Fuzzy-matches against the full TrailerDB index. Use `--type` to filter by `movie`, `series`, or `all` (default). Series search requires the local database.

### Movie Details

```bash
trailerdb movie tt0468569
trailerdb movie "the dark knight"
trailerdb movie tt0468569 --json
trailerdb movie tt0468569 --languages
trailerdb movie tt0468569 --engagement
```

Accepts an IMDb ID or a title search string. Shows movie info with color-coded ratings, trailer groups with language availability, view counts, and formatted durations.

- `--languages` shows what languages a movie's trailers are available in
- `--engagement` shows YouTube engagement stats (views, likes, most popular trailer)
- `--json` includes ALL data including trailer_groups

### Series

```bash
trailerdb series search "breaking bad"
trailerdb series search "stranger things" --limit 5
trailerdb series show 1396
trailerdb series show "breaking bad" --json
```

Browse and view TV series trailers. Accepts TMDB IDs or name search strings. Requires the local database.

### List Trailers

```bash
trailerdb trailers tt0468569
trailerdb trailers "inception" --type trailer
trailerdb trailers tt0468569 --lang en
trailerdb trailers tt0468569 --urls-only
trailerdb trailers tt0468569 --urls-only | xargs -I {} yt-dlp {}
trailerdb trailers tt0468569 --json
```

Like `movie` but focused on trailer URLs. Use `--urls-only` for piping.

### Download Trailers

```bash
trailerdb download tt0468569
trailerdb download "inception" --type trailer --lang en
trailerdb download tt0468569 --best --quality 1080
trailerdb download tt0468569 --format audio -o ~/Music
trailerdb download tt0468569 --format webm --quality 720
trailerdb download tt0468569 --subs --all-languages
trailerdb download tt0468569 --output-dir ~/Movies/Trailers
trailerdb download tt0468569 --dry-run
```

Downloads trailers using yt-dlp. Options:

- `--format mp4|webm|audio` -- output format
- `--quality 720|1080|best` -- video quality
- `--subs` -- also download subtitles
- `--all-languages` -- download all language versions
- `--best` -- download only the most-viewed trailer

### Trailer Info

```bash
trailerdb info EXeTwQWrcwY
trailerdb info dQw4w9WgXcQ --json
```

Look up a specific YouTube trailer by its ID. Shows which movie/series it belongs to, type, language, views, available formats, subtitles, and audio tracks.

### Compare Movies

```bash
trailerdb compare tt0468569 tt1375666
trailerdb compare tt0468569 tt1375666 --json
```

Compare trailer stats between two movies side by side: ratings, views, likes, trailer counts, language availability, and more.

### Languages

```bash
trailerdb languages
trailerdb languages --limit 20
trailerdb languages --json
```

Show all available languages with trailer counts, movie coverage, and visual coverage bars.

### Channels

```bash
trailerdb channels
trailerdb channels --top 10
trailerdb channels --json
```

Show the top YouTube channels uploading trailers, with trailer counts and total views.

### Trending

```bash
trailerdb trending
trailerdb trending --limit 10
trailerdb trending --json
```

Show currently trending movies based on recent trailer publication and view counts.

### Top Rated

```bash
trailerdb top-rated
trailerdb top-rated --min-votes 50000
trailerdb top-rated --limit 50 --json
```

Show the highest-rated movies that have trailers, filtered by minimum vote count.

### New Trailers

```bash
trailerdb new
trailerdb new --days 30
trailerdb new --days 1 --json
```

Show recently released trailers from the last N days (default: 7).

### Analytics

```bash
trailerdb analytics
trailerdb analytics --json
```

Print comprehensive analytics to the terminal: total views, most viewed trailers, top channels, language breakdown, type distribution, and series stats. A terminal version of the analytics page with sparkline bars.

### Export

```bash
trailerdb export --format urls --filter genre=action --filter year>=2020
trailerdb export --format csv --filter rating>=8 -o top-trailers.csv
trailerdb export --format json --filter lang=en | jq '.[] | .youtube_id'
trailerdb export --format urls --filter genre=horror | yt-dlp -a -
```

Export filtered data in JSON, CSV, or URL-per-line format. The `urls` format outputs one YouTube URL per line for piping to yt-dlp.

### Playlist

```bash
trailerdb playlist genre=horror year>=2020 --open
trailerdb playlist genre=action rating>=8 --name "Top Action" --limit 20
trailerdb playlist lang=fr type=trailer --json
```

Generate a YouTube playlist URL from filtered trailers. Use `--open` to open directly in browser.

### Batch Export

```bash
trailerdb batch genre=horror year>=2020 rating>=8 lang=en type=trailer
trailerdb batch genre=action year>=2015 --output action-trailers.txt
trailerdb batch has_subs=true views>=1000000 channel=warner
yt-dlp -a action-trailers.txt
```

Queries the local SQLite database with filters and generates a manifest file of YouTube URLs.

Filter syntax:

- `genre=horror` -- filter by genre name
- `year>=2020` / `year<=2023` / `year=2022` -- year filters
- `rating>=8` -- minimum IMDb rating
- `lang=en` -- trailer language
- `type=trailer` -- trailer type (trailer, teaser, clip, featurette, etc.)
- `has_subs=true` -- only trailers with subtitles
- `channel=warner` -- filter by channel name (substring match)
- `views>=1000000` -- filter by view count
- `duration<=180` -- filter by duration in seconds

### View Stats

```bash
trailerdb stats
trailerdb stats --local
trailerdb stats --json
```

Displays movie count, trailer count, language breakdown, and type breakdown. Use `--local` for expanded stats including YouTube engagement, most viewed trailers, and series data.

### Random Movie

```bash
trailerdb random
trailerdb random --json
```

Shows a randomly selected movie and its trailers. Great for discovery.

### Database Management

Download the full SQLite database for local queries and advanced features:

```bash
trailerdb db download
trailerdb db info
trailerdb db info --json
```

The database is saved to `~/.trailerdb/trailerdb.db`. Many commands (analytics, languages, channels, trending, top-rated, new, compare, series, info, export, playlist) require the local database.

## Configuration

### API URL

Set a custom API base URL:

```bash
trailerdb --api-url https://example.com/data search "batman"
# or via environment variable:
export TRAILERDB_API_URL=https://example.com/data
```

### Database URL

Set a custom database download URL:

```bash
export TRAILERDB_DB_URL=https://example.com/trailerdb.db.gz
trailerdb db download
```

## JSON Output

Every command supports `--json` for machine-readable output. JSON output uses syntax-highlighted pretty-printing by default. Pipe to `jq` for further processing:

```bash
trailerdb movie tt0468569 --json | jq '.trailers[].youtube_id'
trailerdb analytics --json | jq '.most_viewed[:5]'
trailerdb export --format json --filter genre=horror | jq 'length'
```

## Examples

### Discovery workflow

```bash
# What's trending?
trailerdb trending --limit 5

# Find top-rated sci-fi
trailerdb top-rated --min-votes 100000

# Discover something random
trailerdb random
```

### Research workflow

```bash
# Full analytics dashboard
trailerdb analytics

# Language coverage analysis
trailerdb languages --limit 30

# Compare two blockbusters
trailerdb compare tt0468569 tt1375666

# Channel analysis
trailerdb channels --top 20
```

### Download workflow

```bash
# Download best trailer in 1080p
trailerdb download "inception" --best --quality 1080

# Download all language versions with subtitles
trailerdb download tt0468569 --all-languages --subs

# Batch download horror trailers
trailerdb batch genre=horror year>=2020 rating>=7.5 type=trailer -o horror.txt
yt-dlp -a horror.txt

# Export URLs for a playlist
trailerdb export --format urls --filter genre=action --filter rating>=8 | yt-dlp -a -
```

### Pipe-friendly workflows

```bash
# Get YouTube IDs for processing
trailerdb movie tt0468569 --json | jq -r '.trailers[].youtube_id'

# Export and open playlist
trailerdb playlist genre=comedy year>=2023 --open

# Trailer info lookup
trailerdb info EXeTwQWrcwY --json | jq '.view_count'
```
