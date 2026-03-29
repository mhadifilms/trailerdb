# TrailerDB CLI

A command-line tool for browsing and downloading movie trailers from [TrailerDB](https://trailerdb.com).

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

## Commands

### Search for movies

```bash
trailerdb search "the dark knight"
trailerdb search "inception" --limit 5
```

Fuzzy-matches against the full TrailerDB index and displays results in a table with title, year, rating, and trailer count.

### View movie details

```bash
trailerdb movie tt0468569
trailerdb movie "the dark knight"
trailerdb movie tt0468569 --json
```

Accepts an IMDb ID or a title search string. Shows movie info (title, year, rating, runtime, genres, overview) and lists all trailers with YouTube URLs.

### List trailers

```bash
trailerdb trailers tt0468569
trailerdb trailers "inception" --type trailer
trailerdb trailers tt0468569 --lang en
trailerdb trailers tt0468569 --urls-only
trailerdb trailers tt0468569 --urls-only | xargs -I {} yt-dlp {}
```

Like `movie` but focused on trailer URLs. Use `--urls-only` for piping.

### Download trailers

```bash
trailerdb download tt0468569
trailerdb download "inception" --type trailer --lang en
trailerdb download tt0468569 --best
trailerdb download tt0468569 --output-dir ~/Movies/Trailers
trailerdb download tt0468569 --dry-run
```

Downloads trailers using yt-dlp. Files are named as `{Movie Title} - {Trailer Title} [{youtube_id}].mp4`.

### Batch export

```bash
trailerdb batch genre=horror year>=2020 rating>=8 lang=en type=trailer
trailerdb batch genre=action year>=2015 --output action-trailers.txt
yt-dlp -a action-trailers.txt
```

Queries the local SQLite database with filters and generates a manifest file of YouTube URLs. Requires `trailerdb db download` first.

Filter syntax:
- `genre=horror` -- filter by genre name
- `year>=2020` -- minimum year
- `year<=2023` -- maximum year
- `year=2022` -- exact year
- `rating>=8` -- minimum IMDb rating
- `lang=en` -- trailer language
- `type=trailer` -- trailer type (trailer, teaser, clip, featurette, etc.)

### View stats

```bash
trailerdb stats
```

Displays movie count, trailer count, language breakdown, and type breakdown.

### Random movie

```bash
trailerdb random
```

Shows a randomly selected movie and its trailers. Great for discovery.

### Database management

Download the full SQLite database for local queries:

```bash
trailerdb db download
trailerdb db info
```

The database is saved to `~/.trailerdb/trailerdb.db`.

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

## Examples

Find horror movies with high ratings and download their trailers:

```bash
# Search online
trailerdb search "alien"

# View a specific movie
trailerdb movie tt0078748

# Download the best trailer
trailerdb download tt0078748 --best

# Batch export from local DB
trailerdb db download
trailerdb batch genre=horror year>=2020 rating>=7.5 type=trailer -o horror.txt
yt-dlp -a horror.txt
```

Pipe trailer URLs directly to yt-dlp:

```bash
trailerdb trailers "the matrix" --urls-only | xargs -I {} yt-dlp {}
```
