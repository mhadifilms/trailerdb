"""TrailerDB CLI - Browse and download movie trailers from the command line."""

from __future__ import annotations

import csv
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import click
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)

from trailerdb_cli import __version__
from trailerdb_cli.client import TrailerDBClient
from trailerdb_cli.display import (
    console,
    display_analytics,
    display_batch_results,
    display_channels,
    display_compare,
    display_db_info,
    display_export_results,
    display_json,
    display_languages,
    display_movie_detail,
    display_movie_engagement,
    display_movie_languages,
    display_new_trailers,
    display_search_results,
    display_search_results_combined,
    display_series_detail,
    display_series_search_results,
    display_stats,
    display_top_rated,
    display_trailer_info,
    display_trailer_urls,
    display_trending,
    print_error,
)


def _make_client(ctx: click.Context) -> TrailerDBClient:
    """Create or retrieve the API client from the Click context."""
    if "client" not in ctx.ensure_object(dict):
        api_url = ctx.obj.get("api_url")
        ctx.obj["client"] = TrailerDBClient(base_url=api_url)
    return ctx.obj["client"]


def _sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filename."""
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    name = name.strip(". ")
    return name or "untitled"


def _require_local_db() -> None:
    """Raise a helpful error if the local DB is missing."""
    from trailerdb_cli.local import db_exists

    if not db_exists():
        print_error(
            "Local database not found. Run 'trailerdb db download' first."
        )
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# Main CLI group
# ---------------------------------------------------------------------------


@click.group()
@click.version_option(__version__, prog_name="trailerdb")
@click.option(
    "--api-url",
    envvar="TRAILERDB_API_URL",
    default=None,
    help="Base URL for the TrailerDB static JSON API.",
)
@click.pass_context
def cli(ctx: click.Context, api_url: str | None) -> None:
    """TrailerDB -- browse and download movie trailers from the command line.

    A power-user tool for exploring trailerdb.com's data. Use the online API
    for quick lookups or download the SQLite database for advanced queries.

    \b
    Quick start:
      trailerdb search "inception"        Search for movies
      trailerdb movie tt1375666           View movie details
      trailerdb download tt1375666 --best Download the best trailer
      trailerdb db download               Get the full local database
      trailerdb analytics                 View the analytics dashboard
    """
    ctx.ensure_object(dict)
    if api_url:
        ctx.obj["api_url"] = api_url


# ---------------------------------------------------------------------------
# search
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("query")
@click.option("--limit", "-n", default=10, show_default=True, help="Max results to show.")
@click.option(
    "--type", "search_type",
    type=click.Choice(["movie", "series", "all"]),
    default="all",
    show_default=True,
    help="Type of content to search.",
)
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
@click.pass_context
def search(ctx: click.Context, query: str, limit: int, search_type: str, as_json: bool) -> None:
    """Search for movies and series by title.

    Fuzzy-matches QUERY against the full TrailerDB browse index and
    optionally the local series database.

    \b
    Examples:
      trailerdb search "the dark knight"
      trailerdb search "breaking bad" --type series
      trailerdb search "inception" --limit 5 --json
    """
    client = _make_client(ctx)
    movies: list[list] = []
    series_results: list[dict] = []
    genres: dict = {}

    try:
        if search_type in ("movie", "all"):
            with console.status("[bold cyan]Searching movies...[/bold cyan]"):
                movies = client.search_index(query, limit=limit)
                genres = client.get_genres()

        if search_type in ("series", "all"):
            from trailerdb_cli.local import db_exists, search_series

            if db_exists():
                with console.status("[bold cyan]Searching series...[/bold cyan]"):
                    series_results = search_series(query, limit=limit)

        if as_json:
            display_json({
                "movies": movies,
                "series": series_results,
            })
        elif search_type == "all" and (movies or series_results):
            display_search_results_combined(movies, series_results, genres, query)
        elif search_type == "series":
            display_series_search_results(series_results, query)
        else:
            display_search_results(movies, genres, query)

    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# movie
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("identifier")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON (includes trailer_groups).")
@click.option("--languages", is_flag=True, help="Show language availability.")
@click.option("--engagement", is_flag=True, help="Show YouTube engagement stats.")
@click.pass_context
def movie(ctx: click.Context, identifier: str, as_json: bool, languages: bool, engagement: bool) -> None:
    """Show movie details and trailers.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.

    \b
    Examples:
      trailerdb movie tt0468569
      trailerdb movie "the dark knight" --json
      trailerdb movie tt0468569 --languages
      trailerdb movie tt0468569 --engagement
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching movie...[/bold cyan]"):
            imdb_id = client.resolve_identifier(identifier)

            # If languages or engagement, use local DB for richer data
            if languages or engagement:
                _require_local_db()
                from trailerdb_cli.local import (
                    get_movie_detail as local_detail,
                    get_movie_engagement,
                    get_movie_languages,
                )

                detail = local_detail(imdb_id)
                if detail is None:
                    detail = client.get_movie_detail(imdb_id)
            else:
                # Try local DB first for richer data, fall back to API
                try:
                    from trailerdb_cli.local import (
                        db_exists,
                        get_movie_detail as local_detail,
                    )

                    if db_exists():
                        detail = local_detail(imdb_id)
                        if detail is None:
                            detail = client.get_movie_detail(imdb_id)
                    else:
                        detail = client.get_movie_detail(imdb_id)
                except Exception:
                    detail = client.get_movie_detail(imdb_id)

        if languages:
            from trailerdb_cli.local import get_movie_languages

            lang_data = get_movie_languages(imdb_id)
            movie_title = detail.get("title", identifier) if detail else identifier
            display_movie_languages(lang_data, movie_title)
        elif engagement:
            from trailerdb_cli.local import get_movie_engagement

            eng_data = get_movie_engagement(imdb_id)
            movie_title = detail.get("title", identifier) if detail else identifier
            display_movie_engagement(eng_data, movie_title)
        elif as_json:
            display_json(detail)
        else:
            display_movie_detail(detail)

    except click.ClickException:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# series (command group)
# ---------------------------------------------------------------------------


@cli.group()
def series() -> None:
    """Browse and view TV series trailers.

    Requires the local database (run 'trailerdb db download' first).
    """
    pass


@series.command(name="search")
@click.argument("query")
@click.option("--limit", "-n", default=10, show_default=True, help="Max results.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def series_search(query: str, limit: int, as_json: bool) -> None:
    """Search for TV series by name.

    \b
    Examples:
      trailerdb series search "breaking bad"
      trailerdb series search "stranger things" --limit 5
    """
    _require_local_db()
    from trailerdb_cli.local import search_series

    try:
        with console.status("[bold cyan]Searching series...[/bold cyan]"):
            results = search_series(query, limit=limit)
        if as_json:
            display_json(results)
        else:
            display_series_search_results(results, query)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


@series.command(name="show")
@click.argument("identifier")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def series_show(identifier: str, as_json: bool) -> None:
    """Show series details and trailers.

    IDENTIFIER can be a TMDB ID or a series name search string.

    \b
    Examples:
      trailerdb series show 1396          (Breaking Bad TMDB ID)
      trailerdb series show "breaking bad"
      trailerdb series show "stranger things" --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_series_detail

    try:
        with console.status("[bold cyan]Fetching series...[/bold cyan]"):
            detail = get_series_detail(identifier)

        if detail is None:
            print_error(f"No series found matching '{identifier}'.")
            raise SystemExit(1)

        if as_json:
            display_json(detail)
        else:
            display_series_detail(detail)
    except SystemExit:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# trailers
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("identifier")
@click.option("--type", "trailer_type", default=None, help="Filter by type (trailer, teaser, clip, ...).")
@click.option("--lang", default=None, help="Filter by language code (en, fr, es, ...).")
@click.option("--urls-only", is_flag=True, help="Print only URLs, one per line (for piping).")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
@click.pass_context
def trailers(
    ctx: click.Context,
    identifier: str,
    trailer_type: str | None,
    lang: str | None,
    urls_only: bool,
    as_json: bool,
) -> None:
    """List trailer URLs for a movie.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.

    \b
    Examples:
      trailerdb trailers tt0468569
      trailerdb trailers "inception" --type trailer
      trailerdb trailers tt0468569 --lang en
      trailerdb trailers tt0468569 --urls-only | xargs -I {} yt-dlp {}
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching trailers...[/bold cyan]"):
            imdb_id = client.resolve_identifier(identifier)
            detail = client.get_movie_detail(imdb_id)

        all_trailers = detail.get("trailers", [])
        filtered = _filter_trailers(all_trailers, trailer_type=trailer_type, lang=lang)

        if as_json:
            display_json(filtered)
        else:
            display_trailer_urls(filtered, urls_only=urls_only, movie_title=detail.get("title", ""))
    except click.ClickException:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# download
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("identifier")
@click.option("--type", "trailer_type", default=None, help="Filter by type.")
@click.option("--lang", default=None, help="Filter by language code.")
@click.option("--best", is_flag=True, help="Download only the most-viewed trailer.")
@click.option("--output-dir", "-o", default=".", type=click.Path(), help="Output directory.")
@click.option("--dry-run", is_flag=True, help="Print yt-dlp commands without executing.")
@click.option(
    "--format", "fmt",
    type=click.Choice(["mp4", "webm", "audio"]),
    default="mp4",
    show_default=True,
    help="Output format.",
)
@click.option(
    "--quality", "quality",
    type=click.Choice(["720", "1080", "best"]),
    default="best",
    show_default=True,
    help="Video quality.",
)
@click.option("--subs", is_flag=True, help="Also download subtitles.")
@click.option("--all-languages", is_flag=True, help="Download all language versions.")
@click.option("--json", "as_json", is_flag=True, help="Output download manifest as JSON.")
@click.pass_context
def download(
    ctx: click.Context,
    identifier: str,
    trailer_type: str | None,
    lang: str | None,
    best: bool,
    output_dir: str,
    dry_run: bool,
    fmt: str,
    quality: str,
    subs: bool,
    all_languages: bool,
    as_json: bool,
) -> None:
    """Download trailers for a movie using yt-dlp.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.
    Requires yt-dlp to be installed (pip install 'trailerdb[download]').

    \b
    Examples:
      trailerdb download tt0468569
      trailerdb download "inception" --best --quality 1080
      trailerdb download tt0468569 --format audio -o ~/Music
      trailerdb download tt0468569 --subs --all-languages
      trailerdb download tt0468569 --dry-run
    """
    if not dry_run and not as_json and not shutil.which("yt-dlp"):
        print_error(
            "yt-dlp is not installed. Install it with:\n"
            "  pip install 'trailerdb[download]'\n"
            "  or: pip install yt-dlp"
        )
        raise SystemExit(1)

    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching movie info...[/bold cyan]"):
            imdb_id = client.resolve_identifier(identifier)
            detail = client.get_movie_detail(imdb_id)

        movie_title = detail.get("title", "Unknown")
        all_trailers = detail.get("trailers", [])

        if all_languages:
            # Don't filter by language
            filtered = _filter_trailers(all_trailers, trailer_type=trailer_type, lang=None)
        else:
            filtered = _filter_trailers(all_trailers, trailer_type=trailer_type, lang=lang)

        if best and filtered:
            filtered = [max(filtered, key=lambda t: t.get("views") or 0)]

        if not filtered:
            console.print("[yellow]No trailers found matching filters.[/yellow]")
            return

        if as_json:
            manifest = []
            for t in filtered:
                yt_id = t.get("youtube_id", "")
                manifest.append({
                    "url": f"https://www.youtube.com/watch?v={yt_id}",
                    "title": t.get("title", ""),
                    "type": t.get("type", ""),
                    "language": t.get("language", ""),
                    "views": t.get("views"),
                })
            display_json(manifest)
            return

        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        console.print(
            f"\n[bold cyan]{movie_title}[/bold cyan] - "
            f"downloading {len(filtered)} trailer(s) to [dim]{out_path.resolve()}[/dim]\n"
        )

        for i, t in enumerate(filtered, 1):
            yt_id = t.get("youtube_id", "")
            t_title = t.get("title") or t.get("type", "trailer")
            safe_movie = _sanitize_filename(movie_title)
            safe_title = _sanitize_filename(t_title)
            url = f"https://www.youtube.com/watch?v={yt_id}"

            # Build format string
            if fmt == "audio":
                format_str = "bestaudio[ext=m4a]/bestaudio/best"
                ext = "m4a"
                merge_fmt = None
            elif fmt == "webm":
                if quality == "720":
                    format_str = "bestvideo[height<=720][ext=webm]+bestaudio[ext=webm]/best[height<=720][ext=webm]/best"
                elif quality == "1080":
                    format_str = "bestvideo[height<=1080][ext=webm]+bestaudio[ext=webm]/best[height<=1080][ext=webm]/best"
                else:
                    format_str = "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best"
                ext = "webm"
                merge_fmt = "webm"
            else:  # mp4
                if quality == "720":
                    format_str = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"
                elif quality == "1080":
                    format_str = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
                else:
                    format_str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
                ext = "mp4"
                merge_fmt = "mp4"

            filename = f"{safe_movie} - {safe_title} [{yt_id}].%(ext)s"

            cmd = ["yt-dlp", "-f", format_str]
            if merge_fmt:
                cmd += ["--merge-output-format", merge_fmt]
            if subs:
                cmd += ["--write-sub", "--write-auto-sub", "--sub-lang", "all"]
            cmd += ["-o", str(out_path / filename), url]

            if dry_run:
                console.print(f"[dim][{i}/{len(filtered)}][/dim] " + " ".join(cmd))
            else:
                label = t.get("type", "trailer")
                lang_display = t.get("language", "")
                lang_str = f" [{lang_display}]" if lang_display else ""
                console.print(
                    f"[dim][{i}/{len(filtered)}][/dim] "
                    f"[magenta]{label}[/magenta]{lang_str}  {t_title}"
                )
                result = subprocess.run(cmd, capture_output=False)
                if result.returncode != 0:
                    console.print(f"  [red]yt-dlp exited with code {result.returncode}[/red]")

        if not dry_run:
            console.print(f"\n[green]Done! Files saved to {out_path.resolve()}[/green]\n")

    except click.ClickException:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# batch
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("filter_expression", nargs=-1, required=True)
@click.option(
    "--output", "-o",
    default="manifest.txt",
    show_default=True,
    help="Output manifest file path.",
)
@click.option("--json", "as_json", is_flag=True, help="Output results as JSON.")
@click.pass_context
def batch(ctx: click.Context, filter_expression: tuple[str, ...], output: str, as_json: bool) -> None:
    """Generate a yt-dlp manifest from local database with filters.

    FILTER_EXPRESSION is one or more key=value pairs:

    \b
        genre=horror year>=2020 rating>=8 lang=en type=trailer
        has_subs=true channel=warner views>=1000000 duration<=180

    Requires the local database (run 'trailerdb db download' first).
    Output is a text file with one YouTube URL per line, for use with:

    \b
        yt-dlp -a manifest.txt
    """
    from trailerdb_cli.local import query_trailers_filtered

    filters = _parse_filters(filter_expression)

    try:
        with console.status("[bold cyan]Querying local database...[/bold cyan]"):
            results = query_trailers_filtered(**filters)

        if not results:
            console.print("[yellow]No trailers matched the given filters.[/yellow]")
            return

        if as_json:
            display_json(results)
            return

        out_path = Path(output)
        with out_path.open("w") as f:
            for row in results:
                f.write(f"https://www.youtube.com/watch?v={row['youtube_id']}\n")

        display_batch_results(results, str(out_path))

    except FileNotFoundError as exc:
        print_error(str(exc))
        raise SystemExit(1)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# stats
# ---------------------------------------------------------------------------


@cli.command()
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
@click.option("--local", "use_local", is_flag=True, help="Use local database for expanded stats.")
@click.pass_context
def stats(ctx: click.Context, as_json: bool, use_local: bool) -> None:
    """Show TrailerDB statistics.

    By default fetches stats from the API. Use --local for expanded stats
    including YouTube engagement, most viewed trailers, and series data.

    \b
    Examples:
      trailerdb stats
      trailerdb stats --local
      trailerdb stats --json
    """
    if use_local:
        _require_local_db()
        from trailerdb_cli.local import get_db_info

        try:
            with console.status("[bold cyan]Querying local database...[/bold cyan]"):
                info = get_db_info()
            if as_json:
                display_json(info)
            else:
                display_db_info(info)
        except Exception as exc:
            print_error(str(exc))
            raise SystemExit(1)
    else:
        client = _make_client(ctx)
        try:
            with console.status("[bold cyan]Fetching stats...[/bold cyan]"):
                data = client.get_stats()
            if as_json:
                display_json(data)
            else:
                display_stats(data)
        except Exception as exc:
            print_error(str(exc))
            raise SystemExit(1)


# ---------------------------------------------------------------------------
# random
# ---------------------------------------------------------------------------


@cli.command(name="random")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
@click.pass_context
def random_movie(ctx: click.Context, as_json: bool) -> None:
    """Show a random movie and its trailers -- for discovery.

    \b
    Examples:
      trailerdb random
      trailerdb random --json
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Picking a random movie...[/bold cyan]"):
            movies = client.get_movies()
            if not movies:
                print_error("The index is empty.")
                raise SystemExit(1)
            pick = random.choice(movies)
            imdb_id = pick[0]  # IDX_IMDB_ID
            detail = client.get_movie_detail(imdb_id)

        if as_json:
            display_json(detail)
        else:
            display_movie_detail(detail)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# languages
# ---------------------------------------------------------------------------


@cli.command()
@click.option("--limit", "-n", default=50, show_default=True, help="Max languages to show.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def languages(limit: int, as_json: bool) -> None:
    """Show all available languages with trailer counts and coverage.

    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb languages
      trailerdb languages --limit 20
      trailerdb languages --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_language_stats

    try:
        with console.status("[bold cyan]Querying languages...[/bold cyan]"):
            results = get_language_stats()

        results = results[:limit]
        if as_json:
            display_json(results)
        else:
            display_languages(results)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# channels
# ---------------------------------------------------------------------------


@cli.command()
@click.option("--top", "-n", default=20, show_default=True, help="Number of channels to show.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def channels(top: int, as_json: bool) -> None:
    """Show top YouTube channels uploading trailers.

    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb channels
      trailerdb channels --top 10
      trailerdb channels --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_channel_stats

    try:
        with console.status("[bold cyan]Querying channels...[/bold cyan]"):
            results = get_channel_stats(top_n=top)

        if as_json:
            display_json(results)
        else:
            display_channels(results)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# trending
# ---------------------------------------------------------------------------


@cli.command()
@click.option("--limit", "-n", default=20, show_default=True, help="Number of results.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def trending(limit: int, as_json: bool) -> None:
    """Show currently trending movies with trailers.

    Based on recent trailer publication dates and view counts.
    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb trending
      trailerdb trending --limit 10
      trailerdb trending --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_trending

    try:
        with console.status("[bold cyan]Finding trending movies...[/bold cyan]"):
            results = get_trending(limit=limit)

        if as_json:
            display_json(results)
        else:
            display_trending(results)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# top-rated
# ---------------------------------------------------------------------------


@cli.command(name="top-rated")
@click.option("--min-votes", default=10000, show_default=True, help="Minimum IMDb vote count.")
@click.option("--limit", "-n", default=20, show_default=True, help="Number of results.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def top_rated(min_votes: int, limit: int, as_json: bool) -> None:
    """Show top-rated movies with trailers.

    Filters by minimum vote count to avoid obscure films with few votes.
    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb top-rated
      trailerdb top-rated --min-votes 50000
      trailerdb top-rated --limit 50 --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_top_rated

    try:
        with console.status("[bold cyan]Querying top-rated movies...[/bold cyan]"):
            results = get_top_rated(min_votes=min_votes, limit=limit)

        if as_json:
            display_json(results)
        else:
            display_top_rated(results)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# new
# ---------------------------------------------------------------------------


@cli.command(name="new")
@click.option("--days", "-d", default=7, show_default=True, help="Number of days to look back.")
@click.option("--limit", "-n", default=50, show_default=True, help="Max results.")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def new_trailers(days: int, limit: int, as_json: bool) -> None:
    """Show recently released trailers.

    Shows trailers published within the last N days (by published_at date).
    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb new
      trailerdb new --days 30
      trailerdb new --days 1 --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_new_trailers

    try:
        with console.status("[bold cyan]Finding new trailers...[/bold cyan]"):
            results = get_new_trailers(days=days, limit=limit)

        if as_json:
            display_json(results)
        else:
            display_new_trailers(results, days)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# compare
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("id1")
@click.argument("id2")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def compare(id1: str, id2: str, as_json: bool) -> None:
    """Compare trailer stats between two movies side by side.

    Each argument is an IMDb ID (e.g. tt0468569). Requires the local database.

    \b
    Examples:
      trailerdb compare tt0468569 tt1375666
      trailerdb compare tt0468569 tt1375666 --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_movie_compare_data

    try:
        with console.status("[bold cyan]Comparing movies...[/bold cyan]"):
            m1 = get_movie_compare_data(id1)
            m2 = get_movie_compare_data(id2)

        if m1 is None:
            print_error(f"Movie not found: {id1}")
            raise SystemExit(1)
        if m2 is None:
            print_error(f"Movie not found: {id2}")
            raise SystemExit(1)

        if as_json:
            display_json({"movie_1": m1, "movie_2": m2})
        else:
            display_compare(m1, m2)
    except SystemExit:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# analytics
# ---------------------------------------------------------------------------


@cli.command()
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def analytics(as_json: bool) -> None:
    """Print comprehensive analytics to the terminal.

    Shows total views, most viewed trailers, top channels, language breakdown,
    type distribution, and series stats. A terminal version of the analytics page.

    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb analytics
      trailerdb analytics --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_analytics

    try:
        with console.status("[bold cyan]Computing analytics...[/bold cyan]"):
            data = get_analytics()

        if as_json:
            display_json(data)
        else:
            display_analytics(data)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------


@cli.command()
@click.option(
    "--format", "fmt",
    type=click.Choice(["json", "csv", "urls"]),
    default="json",
    show_default=True,
    help="Output format.",
)
@click.option("--filter", "filter_expressions", multiple=True, help="Filter expression (can be repeated).")
@click.option("--output", "-o", default=None, help="Output file path. Defaults to stdout.")
@click.option("--limit", "-n", default=None, type=int, help="Max results to export.")
def export(fmt: str, filter_expressions: tuple[str, ...], output: str | None, limit: int | None) -> None:
    """Export filtered trailer data.

    Outputs trailer data in JSON, CSV, or URL-per-line format.
    The 'urls' format outputs one YouTube URL per line, perfect for piping to yt-dlp.

    \b
    Filters:
      genre=action   year>=2020   rating>=8   lang=en   type=trailer
      has_subs=true  channel=warner  views>=1000000  duration<=180

    \b
    Examples:
      trailerdb export --format urls --filter genre=action --filter year>=2020
      trailerdb export --format csv --filter rating>=8 -o top-trailers.csv
      trailerdb export --format json --filter lang=en | jq '.[] | .youtube_id'
      trailerdb export --format urls --filter genre=horror | yt-dlp -a -
    """
    _require_local_db()
    from trailerdb_cli.local import query_trailers_filtered

    filters = _parse_filters(filter_expressions)

    try:
        with console.status("[bold cyan]Querying...[/bold cyan]"):
            results = query_trailers_filtered(**filters)

        if limit:
            results = results[:limit]

        if not results:
            console.print("[yellow]No trailers matched the given filters.[/yellow]")
            return

        if fmt == "urls":
            content = "\n".join(
                f"https://www.youtube.com/watch?v={r['youtube_id']}" for r in results
            ) + "\n"
        elif fmt == "csv":
            buf = io.StringIO()
            if results:
                writer = csv.DictWriter(buf, fieldnames=results[0].keys())
                writer.writeheader()
                writer.writerows(results)
            content = buf.getvalue()
        else:  # json
            content = json.dumps(results, indent=2, ensure_ascii=False, default=str)

        if output:
            Path(output).write_text(content)
            display_export_results(results, fmt, output)
        else:
            if fmt == "json":
                display_json(results)
            else:
                print(content, end="")

    except FileNotFoundError as exc:
        print_error(str(exc))
        raise SystemExit(1)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# playlist
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("filter_expression", nargs=-1, required=True)
@click.option("--name", default=None, help="Playlist name (for display).")
@click.option("--limit", "-n", default=50, show_default=True, help="Max trailers in playlist.")
@click.option("--open", "open_browser", is_flag=True, help="Open playlist in browser.")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON.")
def playlist(
    filter_expression: tuple[str, ...],
    name: str | None,
    limit: int,
    open_browser: bool,
    as_json: bool,
) -> None:
    """Generate a YouTube playlist URL from filtered trailers.

    Uses the same filter syntax as 'batch'. Generates a YouTube watch URL
    with a video list that acts as an ad-hoc playlist.

    \b
    Examples:
      trailerdb playlist genre=horror year>=2020 --open
      trailerdb playlist genre=action rating>=8 --name "Top Action" --limit 20
      trailerdb playlist lang=fr type=trailer --json
    """
    _require_local_db()
    from trailerdb_cli.local import query_trailers_filtered

    filters = _parse_filters(filter_expression)

    try:
        with console.status("[bold cyan]Building playlist...[/bold cyan]"):
            results = query_trailers_filtered(**filters)

        if not results:
            console.print("[yellow]No trailers matched the given filters.[/yellow]")
            return

        results = results[:limit]
        youtube_ids = [r["youtube_id"] for r in results]

        # YouTube watch URL with playlist
        if len(youtube_ids) > 1:
            first = youtube_ids[0]
            rest = ",".join(youtube_ids[1:])
            playlist_url = f"https://www.youtube.com/watch_videos?video_ids={','.join(youtube_ids)}"
        else:
            playlist_url = f"https://www.youtube.com/watch?v={youtube_ids[0]}"

        playlist_name = name or "TrailerDB Playlist"

        if as_json:
            display_json({
                "name": playlist_name,
                "url": playlist_url,
                "count": len(youtube_ids),
                "video_ids": youtube_ids,
            })
        else:
            console.print()
            console.print(f"[bold cyan]{playlist_name}[/bold cyan]  ({len(youtube_ids)} trailers)")
            console.print()
            console.print(f"  [bold]{playlist_url}[/bold]")
            console.print()

            if open_browser:
                webbrowser.open(playlist_url)
                console.print("[green]Opened in browser.[/green]\n")

    except FileNotFoundError as exc:
        print_error(str(exc))
        raise SystemExit(1)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# info (trailer by YouTube ID)
# ---------------------------------------------------------------------------


@cli.command()
@click.argument("youtube_id")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def info(youtube_id: str, as_json: bool) -> None:
    """Look up a specific YouTube trailer by its ID.

    Shows which movie/series it belongs to, type, language, views, available
    formats, subtitles, and audio tracks.

    Requires the local database (run 'trailerdb db download' first).

    \b
    Examples:
      trailerdb info dQw4w9WgXcQ
      trailerdb info EXeTwQWrcwY --json
    """
    _require_local_db()
    from trailerdb_cli.local import get_trailer_by_youtube_id

    try:
        with console.status("[bold cyan]Looking up trailer...[/bold cyan]"):
            result = get_trailer_by_youtube_id(youtube_id)

        if result is None:
            print_error(f"No trailer found with YouTube ID '{youtube_id}'.")
            raise SystemExit(1)

        if as_json:
            display_json(result)
        else:
            display_trailer_info(result)

    except SystemExit:
        raise
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# db (command group)
# ---------------------------------------------------------------------------


@cli.group(name="db")
def db_group() -> None:
    """Manage the local TrailerDB SQLite database."""
    pass


@db_group.command(name="download")
@click.option(
    "--url",
    default=None,
    envvar="TRAILERDB_DB_URL",
    help="URL to the compressed SQLite database.",
)
@click.pass_context
def db_download(ctx: click.Context, url: str | None) -> None:
    """Download the TrailerDB SQLite database to ~/.trailerdb/.

    \b
    Examples:
      trailerdb db download
      trailerdb db download --url https://example.com/trailerdb.db.gz
    """
    import httpx

    if url is None:
        url = os.environ.get(
            "TRAILERDB_DB_URL",
            "https://github.com/mhadifilms/trailerdb/releases/latest/download/trailerdb.db.gz",
        )

    from trailerdb_cli.local import get_db_path

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    gz_path = db_path.parent / "trailerdb.db.gz"

    console.print(f"\n[bold cyan]Downloading database...[/bold cyan]")
    console.print(f"[dim]From: {url}[/dim]")
    console.print(f"[dim]To:   {db_path}[/dim]\n")

    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=300.0) as response:
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))

            with Progress(
                TextColumn("[bold blue]{task.description}"),
                BarColumn(bar_width=40),
                DownloadColumn(),
                TransferSpeedColumn(),
                TimeRemainingColumn(),
                console=console,
            ) as progress:
                task = progress.add_task("Downloading", total=total or None)

                with gz_path.open("wb") as f:
                    for chunk in response.iter_bytes(chunk_size=65536):
                        f.write(chunk)
                        progress.advance(task, len(chunk))

        # Decompress
        console.print("[bold cyan]Decompressing...[/bold cyan]")
        import gzip

        with gzip.open(gz_path, "rb") as gz_in:
            with db_path.open("wb") as db_out:
                while True:
                    chunk = gz_in.read(1_048_576)
                    if not chunk:
                        break
                    db_out.write(chunk)

        gz_path.unlink(missing_ok=True)

        size_mb = db_path.stat().st_size / 1_048_576
        console.print(f"\n[green]Database saved to {db_path} ({size_mb:.1f} MB)[/green]\n")

    except httpx.HTTPStatusError as exc:
        gz_path.unlink(missing_ok=True)
        print_error(f"Download failed: HTTP {exc.response.status_code}")
        raise SystemExit(1)
    except Exception as exc:
        gz_path.unlink(missing_ok=True)
        print_error(f"Download failed: {exc}")
        raise SystemExit(1)


@db_group.command(name="info")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
def db_info(as_json: bool) -> None:
    """Show information about the local database.

    \b
    Examples:
      trailerdb db info
      trailerdb db info --json
    """
    from trailerdb_cli.local import db_exists, get_db_info

    if not db_exists():
        print_error(
            "Local database not found. Run 'trailerdb db download' first."
        )
        raise SystemExit(1)

    try:
        info = get_db_info()
        if as_json:
            display_json(info)
        else:
            display_db_info(info)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _filter_trailers(
    trailers: list[dict[str, Any]],
    trailer_type: str | None = None,
    lang: str | None = None,
) -> list[dict[str, Any]]:
    """Filter a trailer list by type and/or language."""
    result = trailers
    if trailer_type:
        result = [t for t in result if t.get("type") == trailer_type]
    if lang:
        result = [t for t in result if t.get("language") == lang]
    return result


def _parse_filters(expressions: tuple[str, ...]) -> dict[str, Any]:
    """Parse filter expressions like 'genre=horror year>=2020 rating>=8'.

    Returns a dict of keyword arguments for query_trailers_filtered().
    Supports:
      genre=horror, year>=2020, year<=2023, year=2022,
      rating>=8, lang=en, type=trailer, has_subs=true,
      channel=warner, views>=1000000, views<=5000000,
      duration>=60, duration<=180
    """
    filters: dict[str, Any] = {}

    for expr in expressions:
        if ">=" in expr:
            key, val = expr.split(">=", 1)
            key = key.strip()
            val = val.strip()
            if key == "year":
                filters["year_min"] = int(val)
            elif key == "rating":
                filters["rating_min"] = float(val)
            elif key == "views":
                filters["views_min"] = int(val)
            elif key == "duration":
                filters["duration_min"] = int(val)
        elif "<=" in expr:
            key, val = expr.split("<=", 1)
            key = key.strip()
            val = val.strip()
            if key == "year":
                filters["year_max"] = int(val)
            elif key == "views":
                filters["views_max"] = int(val)
            elif key == "duration":
                filters["duration_max"] = int(val)
        elif "=" in expr:
            key, val = expr.split("=", 1)
            key = key.strip()
            val = val.strip()
            if key == "genre":
                filters["genre"] = val
            elif key == "year":
                filters["year_min"] = int(val)
                filters["year_max"] = int(val)
            elif key == "lang":
                filters["lang"] = val
            elif key == "type":
                filters["trailer_type"] = val
            elif key == "rating":
                filters["rating_min"] = float(val)
            elif key == "has_subs":
                if val.lower() in ("true", "1", "yes"):
                    filters["has_subs"] = True
            elif key == "channel":
                filters["channel"] = val
            elif key == "views":
                filters["views_min"] = int(val)
            elif key == "duration":
                filters["duration_min"] = int(val)
                filters["duration_max"] = int(val)

    return filters


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    cli()
