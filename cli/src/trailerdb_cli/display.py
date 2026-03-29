"""Rich display formatting for TrailerDB CLI output."""

from __future__ import annotations

import json
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box

console = Console()
error_console = Console(stderr=True)

# Index field positions
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


def _rating_color(rating: float | None) -> str:
    """Return a color based on IMDb rating."""
    if rating is None:
        return "dim"
    if rating >= 8.0:
        return "green"
    if rating >= 7.0:
        return "yellow"
    if rating >= 5.0:
        return "white"
    return "red"


def _format_rating(rating: float | None) -> Text:
    """Format a rating with color."""
    if rating is None:
        return Text("N/A", style="dim")
    color = _rating_color(rating)
    return Text(f"{rating:.1f}", style=color)


def _format_number(n: int | None) -> str:
    """Format a number with commas."""
    if n is None:
        return "N/A"
    return f"{n:,}"


def _format_duration(seconds: int | None) -> str:
    """Format duration in seconds to mm:ss."""
    if seconds is None:
        return ""
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes}:{secs:02d}"


def _format_views(views: int | None) -> str:
    """Format view count with abbreviation."""
    if views is None:
        return ""
    if views >= 1_000_000_000:
        return f"{views / 1_000_000_000:.1f}B"
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M"
    if views >= 1_000:
        return f"{views / 1_000:.1f}K"
    return str(views)


def display_search_results(
    movies: list[list],
    genres: dict[str, str],
    query: str,
) -> None:
    """Display search results in a rich table."""
    if not movies:
        console.print(f"\n[yellow]No results found for '[bold]{query}[/bold]'[/yellow]\n")
        return

    table = Table(
        title=f"Search results for '{query}'",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=3, justify="right")
    table.add_column("Title", style="bold white", min_width=20, max_width=45)
    table.add_column("Year", justify="center", width=6)
    table.add_column("Rating", justify="center", width=7)
    table.add_column("Votes", justify="right", width=10)
    table.add_column("Trailers", justify="center", width=9)
    table.add_column("IMDb ID", style="dim", width=11)

    for i, movie in enumerate(movies, 1):
        title = movie[IDX_TITLE] or "Unknown"
        year = str(movie[IDX_YEAR]) if movie[IDX_YEAR] else ""
        rating = _format_rating(movie[IDX_RATING])
        votes = _format_number(movie[IDX_VOTES])
        trailers = str(movie[IDX_TRAILER_COUNT]) if movie[IDX_TRAILER_COUNT] else "0"
        imdb_id = movie[IDX_IMDB_ID]

        table.add_row(str(i), title, year, rating, votes, trailers, imdb_id)

    console.print()
    console.print(table)
    console.print()


def display_movie_detail(movie: dict[str, Any]) -> None:
    """Display full movie detail with trailers in a rich panel."""
    # Header info
    title = movie.get("title", "Unknown")
    year = movie.get("year", "")
    rating = movie.get("imdb_rating")
    votes = movie.get("imdb_votes")
    runtime = movie.get("runtime")
    genres = movie.get("genres", [])
    overview = movie.get("overview", "")
    imdb_id = movie.get("imdb_id", "")
    original_language = movie.get("original_language", "")

    # Build info lines
    lines: list[str] = []

    year_str = f"  [dim]({year})[/dim]" if year else ""
    rating_color = _rating_color(rating)
    rating_str = f"[{rating_color}]{rating:.1f}[/{rating_color}]" if rating else "[dim]N/A[/dim]"
    votes_str = f"  [dim]{_format_number(votes)} votes[/dim]" if votes else ""

    lines.append(f"[bold]{rating_str}[/bold]{votes_str}")

    meta_parts: list[str] = []
    if runtime:
        hours = runtime // 60
        mins = runtime % 60
        meta_parts.append(f"{hours}h {mins}m" if hours else f"{mins}m")
    if original_language:
        meta_parts.append(original_language.upper())
    if meta_parts:
        lines.append("[dim]" + "  |  ".join(meta_parts) + "[/dim]")

    if genres:
        genre_tags = "  ".join(f"[cyan]{g}[/cyan]" for g in genres)
        lines.append(genre_tags)

    if overview:
        lines.append("")
        lines.append(overview)

    lines.append("")
    lines.append(f"[dim]IMDb: https://www.imdb.com/title/{imdb_id}/[/dim]")

    panel_title = f"[bold white]{title}[/bold white]{year_str}"
    body = "\n".join(lines)

    console.print()
    console.print(Panel(body, title=panel_title, border_style="cyan", padding=(1, 2)))

    # Trailers
    trailers = movie.get("trailers", [])
    if not trailers:
        console.print("\n[yellow]No trailers available.[/yellow]\n")
        return

    table = Table(
        title=f"Trailers ({len(trailers)})",
        box=box.SIMPLE_HEAD,
        title_style="bold",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("Type", style="magenta", width=18)
    table.add_column("Lang", justify="center", width=5)
    table.add_column("Title", min_width=20, max_width=45)
    table.add_column("Duration", justify="center", width=9)
    table.add_column("Views", justify="right", width=8)
    table.add_column("URL", style="dim")

    for t in trailers:
        t_type = (t.get("type") or "").replace("_", " ").title()
        lang = t.get("language") or ""
        t_title = t.get("title") or ""
        duration = _format_duration(t.get("duration"))
        views = _format_views(t.get("views"))
        yt_id = t.get("youtube_id", "")
        url = f"https://youtu.be/{yt_id}"

        table.add_row(t_type, lang, t_title, duration, views, url)

    console.print(table)
    console.print()


def display_trailer_urls(
    trailers: list[dict[str, Any]],
    urls_only: bool = False,
    movie_title: str = "",
) -> None:
    """Display trailer URLs, optionally in a minimal format for piping."""
    if not trailers:
        if not urls_only:
            console.print("[yellow]No trailers found matching filters.[/yellow]")
        return

    if urls_only:
        for t in trailers:
            yt_id = t.get("youtube_id", "")
            print(f"https://youtu.be/{yt_id}")
        return

    if movie_title:
        console.print(f"\n[bold cyan]{movie_title}[/bold cyan]")

    for t in trailers:
        yt_id = t.get("youtube_id", "")
        t_type = (t.get("type") or "unknown").replace("_", " ").title()
        t_title = t.get("title") or ""
        lang = t.get("language") or ""
        lang_str = f" [{lang}]" if lang else ""

        console.print(
            f"  [magenta]{t_type}[/magenta]{lang_str}  {t_title}  "
            f"[dim]https://youtu.be/{yt_id}[/dim]"
        )

    console.print()


def display_stats(stats: dict[str, Any]) -> None:
    """Display site-wide statistics in a rich panel."""
    lines: list[str] = []

    movies = stats.get("movies_with_trailers", 0)
    trailers = stats.get("total_trailers", 0)
    languages = stats.get("languages", 0)

    lines.append(f"[bold green]{_format_number(movies)}[/bold green]  movies with trailers")
    lines.append(f"[bold green]{_format_number(trailers)}[/bold green]  total trailers")
    lines.append(f"[bold green]{_format_number(languages)}[/bold green]  languages")

    # Type breakdown
    by_type = stats.get("by_type", {})
    if by_type:
        lines.append("")
        lines.append("[bold]By Type[/bold]")
        for ttype, count in by_type.items():
            label = ttype.replace("_", " ").title()
            lines.append(f"  [magenta]{label:<20}[/magenta]  {_format_number(count):>10}")

    # Language breakdown (top 15)
    by_lang = stats.get("by_language", {})
    if by_lang:
        lines.append("")
        lines.append("[bold]Top Languages[/bold]")
        for lang, count in list(by_lang.items())[:15]:
            lines.append(f"  [cyan]{lang:<20}[/cyan]  {_format_number(count):>10}")

    body = "\n".join(lines)
    console.print()
    console.print(
        Panel(body, title="[bold]TrailerDB Stats[/bold]", border_style="green", padding=(1, 2))
    )
    console.print()


def display_db_info(info: dict[str, Any]) -> None:
    """Display local database information."""
    lines: list[str] = []

    db_size = info.get("db_size_bytes", 0)
    if db_size >= 1_073_741_824:
        size_str = f"{db_size / 1_073_741_824:.2f} GB"
    elif db_size >= 1_048_576:
        size_str = f"{db_size / 1_048_576:.1f} MB"
    else:
        size_str = f"{db_size / 1024:.1f} KB"

    from trailerdb_cli.local import get_db_path

    lines.append(f"[bold]Database size:[/bold]  {size_str}")
    lines.append(f"[bold]Location:[/bold]       {get_db_path()}")
    lines.append("")
    lines.append(f"[bold green]{_format_number(info.get('total_movies', 0))}[/bold green]  total movies")
    lines.append(
        f"[bold green]{_format_number(info.get('movies_with_trailers', 0))}[/bold green]  "
        f"movies with trailers"
    )
    lines.append(f"[bold green]{_format_number(info.get('total_trailers', 0))}[/bold green]  total trailers")
    lines.append(f"[bold green]{_format_number(info.get('languages', 0))}[/bold green]  languages")

    by_type = info.get("by_type", {})
    if by_type:
        lines.append("")
        lines.append("[bold]By Type[/bold]")
        for ttype, count in by_type.items():
            label = ttype.replace("_", " ").title()
            lines.append(f"  [magenta]{label:<20}[/magenta]  {_format_number(count):>10}")

    body = "\n".join(lines)
    console.print()
    console.print(
        Panel(body, title="[bold]Local Database[/bold]", border_style="blue", padding=(1, 2))
    )
    console.print()


def display_json(data: Any) -> None:
    """Pretty-print JSON output."""
    from rich.syntax import Syntax

    formatted = json.dumps(data, indent=2, ensure_ascii=False)
    syntax = Syntax(formatted, "json", theme="monokai", line_numbers=False)
    console.print(syntax)


def print_error(message: str) -> None:
    """Print an error message to stderr."""
    error_console.print(f"[bold red]Error:[/bold red] {message}")
