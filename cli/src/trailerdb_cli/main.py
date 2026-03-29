"""TrailerDB CLI - Browse and download movie trailers from the command line."""

from __future__ import annotations

import json
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

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
    display_db_info,
    display_json,
    display_movie_detail,
    display_search_results,
    display_stats,
    display_trailer_urls,
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
    # Remove or replace characters that are problematic in filenames
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    name = name.strip(". ")
    return name or "untitled"


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
    """TrailerDB -- browse and download movie trailers from the command line."""
    ctx.ensure_object(dict)
    if api_url:
        ctx.obj["api_url"] = api_url


# ---------------------------------------------------------------------------
# search
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("query")
@click.option("--limit", "-n", default=10, show_default=True, help="Max results to show.")
@click.pass_context
def search(ctx: click.Context, query: str, limit: int) -> None:
    """Search for movies by title.

    Fuzzy-matches QUERY against the full TrailerDB browse index.
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Searching...[/bold cyan]"):
            results = client.search_index(query, limit=limit)
            genres = client.get_genres()
        display_search_results(results, genres, query)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# movie
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("identifier")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON.")
@click.pass_context
def movie(ctx: click.Context, identifier: str, as_json: bool) -> None:
    """Show movie details and trailers.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching movie...[/bold cyan]"):
            imdb_id = client.resolve_identifier(identifier)
            detail = client.get_movie_detail(imdb_id)

        if as_json:
            display_json(detail)
        else:
            display_movie_detail(detail)
    except click.ClickException:
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
@click.pass_context
def trailers(
    ctx: click.Context,
    identifier: str,
    trailer_type: str | None,
    lang: str | None,
    urls_only: bool,
) -> None:
    """List trailer URLs for a movie.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.
    """
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching trailers...[/bold cyan]"):
            imdb_id = client.resolve_identifier(identifier)
            detail = client.get_movie_detail(imdb_id)

        all_trailers = detail.get("trailers", [])
        filtered = _filter_trailers(all_trailers, trailer_type=trailer_type, lang=lang)
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
@click.pass_context
def download(
    ctx: click.Context,
    identifier: str,
    trailer_type: str | None,
    lang: str | None,
    best: bool,
    output_dir: str,
    dry_run: bool,
) -> None:
    """Download trailers for a movie using yt-dlp.

    IDENTIFIER can be an IMDb ID (tt0468569) or a title search string.
    Requires yt-dlp to be installed (pip install 'trailerdb[download]').
    """
    if not dry_run and not shutil.which("yt-dlp"):
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
        filtered = _filter_trailers(all_trailers, trailer_type=trailer_type, lang=lang)

        if best and filtered:
            # Pick the one with the most views
            filtered = [max(filtered, key=lambda t: t.get("views") or 0)]

        if not filtered:
            console.print("[yellow]No trailers found matching filters.[/yellow]")
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
            filename = f"{safe_movie} - {safe_title} [{yt_id}].%(ext)s"
            url = f"https://www.youtube.com/watch?v={yt_id}"

            cmd = [
                "yt-dlp",
                "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "-o", str(out_path / filename),
                url,
            ]

            if dry_run:
                console.print(f"[dim][{i}/{len(filtered)}][/dim] " + " ".join(cmd))
            else:
                console.print(
                    f"[dim][{i}/{len(filtered)}][/dim] "
                    f"[magenta]{t.get('type', 'trailer')}[/magenta]  {t_title}"
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
@click.pass_context
def batch(ctx: click.Context, filter_expression: tuple[str, ...], output: str) -> None:
    """Generate a yt-dlp manifest from local database with filters.

    FILTER_EXPRESSION is one or more key=value pairs:

    \b
        genre=horror year>=2020 rating>=8 lang=en type=trailer

    Requires the local database (run 'trailerdb db download' first).
    Output is a text file with one YouTube URL per line, for use with:

    \b
        yt-dlp -a manifest.txt
    """
    from trailerdb_cli.local import query_trailers_filtered

    # Parse filter expressions
    filters = _parse_filters(filter_expression)

    try:
        with console.status("[bold cyan]Querying local database...[/bold cyan]"):
            results = query_trailers_filtered(**filters)

        if not results:
            console.print("[yellow]No trailers matched the given filters.[/yellow]")
            return

        # Write manifest
        out_path = Path(output)
        with out_path.open("w") as f:
            for row in results:
                f.write(f"https://www.youtube.com/watch?v={row['youtube_id']}\n")

        console.print(
            f"\n[green]Wrote {len(results):,} URLs to [bold]{out_path}[/bold][/green]"
        )
        console.print(
            f"[dim]Download with: yt-dlp -a {out_path}[/dim]\n"
        )

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
@click.pass_context
def stats(ctx: click.Context) -> None:
    """Show TrailerDB site-wide statistics."""
    client = _make_client(ctx)
    try:
        with console.status("[bold cyan]Fetching stats...[/bold cyan]"):
            data = client.get_stats()
        display_stats(data)
    except Exception as exc:
        print_error(str(exc))
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# random
# ---------------------------------------------------------------------------

@cli.command(name="random")
@click.pass_context
def random_movie(ctx: click.Context) -> None:
    """Show a random movie and its trailers -- for discovery."""
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

        display_movie_detail(detail)
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
    """Download the TrailerDB SQLite database to ~/.trailerdb/."""
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
def db_info() -> None:
    """Show information about the local database."""
    from trailerdb_cli.local import db_exists, get_db_info

    if not db_exists():
        print_error(
            "Local database not found. Run 'trailerdb db download' first."
        )
        raise SystemExit(1)

    try:
        info = get_db_info()
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
        elif "<=" in expr:
            key, val = expr.split("<=", 1)
            key = key.strip()
            val = val.strip()
            if key == "year":
                filters["year_max"] = int(val)
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

    return filters


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cli()
