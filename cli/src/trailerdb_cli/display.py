"""Rich display formatting for TrailerDB CLI output."""

from __future__ import annotations

import json
from typing import Any

from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.tree import Tree

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


# ---------------------------------------------------------------------------
# Shared formatters
# ---------------------------------------------------------------------------


def _rating_color(rating: float | None) -> str:
    """Return a color based on rating value."""
    if rating is None:
        return "dim"
    if rating >= 8.0:
        return "bold green"
    if rating >= 7.0:
        return "green"
    if rating >= 5.0:
        return "yellow"
    return "red"


def _format_rating(rating: float | None) -> Text:
    """Format a rating with color."""
    if rating is None:
        return Text("N/A", style="dim")
    color = _rating_color(rating)
    return Text(f"{rating:.1f}", style=color)


def _format_number(n: int | float | None) -> str:
    """Format a number with commas."""
    if n is None:
        return "N/A"
    if isinstance(n, float):
        return f"{n:,.0f}"
    return f"{n:,}"


def _format_duration(seconds: int | float | None) -> str:
    """Format duration in seconds to M:SS."""
    if seconds is None:
        return ""
    seconds = int(seconds)
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


def _sparkline(value: int | float, max_value: int | float, width: int = 20) -> str:
    """Create a simple bar chart sparkline."""
    if max_value <= 0:
        return ""
    ratio = min(value / max_value, 1.0)
    filled = int(ratio * width)
    return "[cyan]" + "\u2588" * filled + "[/cyan]" + "[dim]" + "\u2591" * (width - filled) + "[/dim]"


def _format_date(date_str: str | None) -> str:
    """Format a date string for display."""
    if not date_str:
        return ""
    # Truncate to just the date portion
    return date_str[:10] if len(date_str) >= 10 else date_str


# ---------------------------------------------------------------------------
# Search results
# ---------------------------------------------------------------------------


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


def display_search_results_combined(
    movies: list[list],
    series: list[dict[str, Any]],
    genres: dict[str, str],
    query: str,
) -> None:
    """Display combined search results for movies and series."""
    if not movies and not series:
        console.print(f"\n[yellow]No results found for '[bold]{query}[/bold]'[/yellow]\n")
        return

    console.print()

    if movies:
        table = Table(
            title=f"Movies matching '{query}'",
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

        console.print(table)
        console.print()

    if series:
        table = Table(
            title=f"Series matching '{query}'",
            box=box.ROUNDED,
            title_style="bold magenta",
            header_style="bold",
            show_lines=False,
            padding=(0, 1),
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Name", style="bold white", min_width=20, max_width=45)
        table.add_column("First Aired", justify="center", width=12)
        table.add_column("Rating", justify="center", width=7)
        table.add_column("Seasons", justify="center", width=8)
        table.add_column("Status", width=12)
        table.add_column("Trailers", justify="center", width=9)
        table.add_column("TMDB ID", style="dim", width=9)

        for i, s in enumerate(series, 1):
            name = s.get("name", "Unknown")
            first_aired = _format_date(s.get("first_air_date"))
            rating = _format_rating(s.get("vote_average"))
            seasons = str(s.get("number_of_seasons", "")) if s.get("number_of_seasons") else ""
            status = s.get("status", "")
            trailers = str(s.get("trailer_count", 0))
            tmdb_id = str(s.get("tmdb_id", ""))
            table.add_row(str(i), name, first_aired, rating, seasons, status, trailers, tmdb_id)

        console.print(table)
        console.print()


# ---------------------------------------------------------------------------
# Movie detail
# ---------------------------------------------------------------------------


def display_movie_detail(movie: dict[str, Any], show_groups: bool = True) -> None:
    """Display full movie detail with trailers in a rich panel."""
    title = movie.get("title", "Unknown")
    year = movie.get("year", "")
    rating = movie.get("imdb_rating")
    votes = movie.get("imdb_votes")
    runtime = movie.get("runtime")
    genres = movie.get("genres", [])
    overview = movie.get("overview", "")
    imdb_id = movie.get("imdb_id", "")
    original_language = movie.get("original_language", "")

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
    lines.append(f"[dim]TrailerDB: https://trailerdb.com/movie/{imdb_id}[/dim]")

    panel_title = f"[bold white]{title}[/bold white]{year_str}"
    body = "\n".join(lines)

    console.print()
    console.print(Panel(body, title=panel_title, border_style="cyan", padding=(1, 2)))

    # Trailer groups (tree view)
    trailer_groups = movie.get("trailer_groups", [])
    if show_groups and trailer_groups:
        tree = Tree(
            f"[bold]Trailer Groups ({len(trailer_groups)})[/bold]",
            guide_style="dim",
        )
        for group in trailer_groups:
            g_type = (group.get("trailer_type") or "").replace("_", " ").title()
            g_title = group.get("canonical_title") or g_type
            g_langs = group.get("languages") or ""
            g_count = group.get("trailer_count", 1)
            g_date = _format_date(group.get("published_at"))

            label = f"[magenta]{g_title}[/magenta]"
            if g_count > 1:
                label += f"  [dim]{g_count} versions[/dim]"
            if g_langs:
                label += f"  [cyan]{g_langs}[/cyan]"
            if g_date:
                label += f"  [dim]{g_date}[/dim]"
            tree.add(label)

        console.print(tree)
        console.print()

    # Trailers table
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
    table.add_column("Views", justify="right", width=10)
    table.add_column("Likes", justify="right", width=8)
    table.add_column("URL", style="dim")

    for t in trailers:
        t_type = (t.get("type") or "").replace("_", " ").title()
        lang = t.get("language") or ""
        t_title = t.get("title") or ""
        duration = _format_duration(t.get("duration"))
        views = _format_views(t.get("views"))
        likes = _format_views(t.get("likes"))
        yt_id = t.get("youtube_id", "")
        url = f"https://youtu.be/{yt_id}"

        table.add_row(t_type, lang, t_title, duration, views, likes, url)

    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Movie languages
# ---------------------------------------------------------------------------


def display_movie_languages(
    languages: list[dict[str, Any]], movie_title: str
) -> None:
    """Display language availability for a movie's trailers."""
    if not languages:
        console.print(f"\n[yellow]No language data for {movie_title}.[/yellow]\n")
        return

    table = Table(
        title=f"Languages for '{movie_title}'",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        padding=(0, 1),
    )
    table.add_column("Language", style="bold", width=12)
    table.add_column("Trailers", justify="right", width=10)
    table.add_column("Total Views", justify="right", width=14)

    for lang in languages:
        table.add_row(
            lang.get("language", ""),
            str(lang.get("count", 0)),
            _format_views(lang.get("total_views")),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Movie engagement
# ---------------------------------------------------------------------------


def display_movie_engagement(
    engagement: dict[str, Any], movie_title: str
) -> None:
    """Display YouTube engagement stats for a movie."""
    console.print()

    lines: list[str] = []
    lines.append(f"[bold green]{_format_number(engagement.get('trailer_count'))}[/bold green]  trailers")
    lines.append(f"[bold green]{_format_views(engagement.get('total_views'))}[/bold green]  total views")
    lines.append(f"[bold green]{_format_views(engagement.get('total_likes'))}[/bold green]  total likes")
    lines.append(f"[bold green]{_format_views(int(engagement.get('avg_views') or 0))}[/bold green]  avg views per trailer")
    lines.append(f"[bold green]{_format_duration(engagement.get('avg_duration'))}[/bold green]  avg duration")

    console.print(Panel(
        "\n".join(lines),
        title=f"[bold]Engagement: {movie_title}[/bold]",
        border_style="green",
        padding=(1, 2),
    ))

    top_trailers = engagement.get("top_trailers", [])
    if top_trailers:
        table = Table(
            title="Most Viewed Trailers",
            box=box.SIMPLE_HEAD,
            title_style="bold",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Type", style="magenta", width=16)
        table.add_column("Title", min_width=20, max_width=40)
        table.add_column("Lang", justify="center", width=5)
        table.add_column("Views", justify="right", width=12)
        table.add_column("Likes", justify="right", width=10)
        table.add_column("Duration", justify="center", width=9)

        for i, t in enumerate(top_trailers, 1):
            table.add_row(
                str(i),
                (t.get("trailer_type") or "").replace("_", " ").title(),
                t.get("title") or "",
                t.get("language") or "",
                _format_number(t.get("view_count")),
                _format_number(t.get("like_count")),
                _format_duration(t.get("duration_seconds")),
            )

        console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Series detail
# ---------------------------------------------------------------------------


def display_series_detail(series: dict[str, Any]) -> None:
    """Display full series detail with trailers."""
    name = series.get("name", "Unknown")
    first_aired = _format_date(series.get("first_air_date"))
    rating = series.get("vote_average")
    vote_count = series.get("vote_count")
    seasons = series.get("number_of_seasons")
    status = series.get("status", "")
    genres = series.get("genres", [])
    overview = series.get("overview", "")
    tmdb_id = series.get("tmdb_id", "")
    original_language = series.get("original_language", "")

    lines: list[str] = []

    date_str = f"  [dim]({first_aired})[/dim]" if first_aired else ""
    rating_color = _rating_color(rating)
    rating_str = f"[{rating_color}]{rating:.1f}[/{rating_color}]" if rating else "[dim]N/A[/dim]"
    votes_str = f"  [dim]{_format_number(vote_count)} votes[/dim]" if vote_count else ""

    lines.append(f"[bold]{rating_str}[/bold]{votes_str}")

    meta_parts: list[str] = []
    if seasons:
        lines_text = f"{seasons} season{'s' if seasons != 1 else ''}"
        meta_parts.append(lines_text)
    if status:
        meta_parts.append(status)
    if original_language:
        meta_parts.append(original_language.upper())
    if meta_parts:
        lines.append("[dim]" + "  |  ".join(meta_parts) + "[/dim]")

    if genres:
        genre_tags = "  ".join(f"[magenta]{g}[/magenta]" for g in genres)
        lines.append(genre_tags)

    if overview:
        lines.append("")
        lines.append(overview)

    lines.append("")
    lines.append(f"[dim]TMDB: https://www.themoviedb.org/tv/{tmdb_id}[/dim]")

    panel_title = f"[bold white]{name}[/bold white]{date_str}"
    body = "\n".join(lines)

    console.print()
    console.print(Panel(body, title=panel_title, border_style="magenta", padding=(1, 2)))

    # Trailers
    trailers = series.get("trailers", [])
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
    table.add_column("Type", style="magenta", width=16)
    table.add_column("Season", justify="center", width=7)
    table.add_column("Lang", justify="center", width=5)
    table.add_column("Title", min_width=20, max_width=40)
    table.add_column("Duration", justify="center", width=9)
    table.add_column("Views", justify="right", width=10)
    table.add_column("URL", style="dim")

    for t in trailers:
        t_type = (t.get("type") or "").replace("_", " ").title()
        season = str(t.get("season_number", "")) if t.get("season_number") else ""
        lang = t.get("language") or ""
        t_title = t.get("title") or ""
        duration = _format_duration(t.get("duration"))
        views = _format_views(t.get("views"))
        yt_id = t.get("youtube_id", "")
        url = f"https://youtu.be/{yt_id}"

        table.add_row(t_type, season, lang, t_title, duration, views, url)

    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Series search results
# ---------------------------------------------------------------------------


def display_series_search_results(
    series_list: list[dict[str, Any]], query: str
) -> None:
    """Display series search results in a table."""
    if not series_list:
        console.print(f"\n[yellow]No series found for '[bold]{query}[/bold]'[/yellow]\n")
        return

    table = Table(
        title=f"Series matching '{query}'",
        box=box.ROUNDED,
        title_style="bold magenta",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=3, justify="right")
    table.add_column("Name", style="bold white", min_width=20, max_width=45)
    table.add_column("First Aired", justify="center", width=12)
    table.add_column("Rating", justify="center", width=7)
    table.add_column("Seasons", justify="center", width=8)
    table.add_column("Status", width=12)
    table.add_column("Trailers", justify="center", width=9)
    table.add_column("TMDB ID", style="dim", width=9)

    for i, s in enumerate(series_list, 1):
        table.add_row(
            str(i),
            s.get("name", "Unknown"),
            _format_date(s.get("first_air_date")),
            _format_rating(s.get("vote_average")),
            str(s.get("number_of_seasons", "")) if s.get("number_of_seasons") else "",
            s.get("status", ""),
            str(s.get("trailer_count", 0)),
            str(s.get("tmdb_id", "")),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------


def display_languages(languages: list[dict[str, Any]]) -> None:
    """Display language stats with coverage bars."""
    if not languages:
        console.print("\n[yellow]No language data available.[/yellow]\n")
        return

    max_count = languages[0].get("trailer_count", 1) if languages else 1

    table = Table(
        title="Language Coverage",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Language", style="bold", width=10)
    table.add_column("Trailers", justify="right", width=10)
    table.add_column("Movies", justify="right", width=10)
    table.add_column("Coverage", justify="right", width=8)
    table.add_column("", width=22)

    for i, lang in enumerate(languages, 1):
        count = lang.get("trailer_count", 0)
        movie_count = lang.get("movie_count", 0)
        pct = lang.get("coverage_pct", 0.0)
        bar = _sparkline(count, max_count)

        table.add_row(
            str(i),
            lang.get("language", ""),
            _format_number(count),
            _format_number(movie_count),
            f"{pct:.1f}%",
            bar,
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------


def display_channels(channels: list[dict[str, Any]]) -> None:
    """Display top YouTube channels."""
    if not channels:
        console.print("\n[yellow]No channel data available.[/yellow]\n")
        return

    table = Table(
        title="Top YouTube Channels",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Channel", style="bold white", min_width=20, max_width=40)
    table.add_column("Trailers", justify="right", width=10)
    table.add_column("Total Views", justify="right", width=14)
    table.add_column("Avg Views", justify="right", width=12)

    for i, ch in enumerate(channels, 1):
        table.add_row(
            str(i),
            ch.get("channel_name", ""),
            _format_number(ch.get("trailer_count")),
            _format_views(ch.get("total_views")),
            _format_views(int(ch.get("avg_views") or 0)),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Trending
# ---------------------------------------------------------------------------


def display_trending(movies: list[dict[str, Any]]) -> None:
    """Display trending movies."""
    if not movies:
        console.print("\n[yellow]No trending data available.[/yellow]\n")
        return

    table = Table(
        title="Trending Movies",
        box=box.ROUNDED,
        title_style="bold yellow",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Title", style="bold white", min_width=20, max_width=40)
    table.add_column("Year", justify="center", width=6)
    table.add_column("Rating", justify="center", width=7)
    table.add_column("Trailers", justify="center", width=9)
    table.add_column("Total Views", justify="right", width=12)
    table.add_column("Latest Trailer", justify="center", width=12)
    table.add_column("IMDb ID", style="dim", width=11)

    for i, m in enumerate(movies, 1):
        table.add_row(
            str(i),
            m.get("title", "Unknown"),
            str(m.get("year", "")),
            _format_rating(m.get("imdb_rating")),
            str(m.get("trailer_count", 0)),
            _format_views(m.get("total_views")),
            _format_date(m.get("latest_trailer")),
            m.get("imdb_id", ""),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Top rated
# ---------------------------------------------------------------------------


def display_top_rated(movies: list[dict[str, Any]]) -> None:
    """Display top-rated movies."""
    if not movies:
        console.print("\n[yellow]No results found.[/yellow]\n")
        return

    table = Table(
        title="Top Rated Movies with Trailers",
        box=box.ROUNDED,
        title_style="bold green",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Title", style="bold white", min_width=20, max_width=40)
    table.add_column("Year", justify="center", width=6)
    table.add_column("Rating", justify="center", width=7)
    table.add_column("Votes", justify="right", width=12)
    table.add_column("Trailers", justify="center", width=9)
    table.add_column("Total Views", justify="right", width=12)
    table.add_column("IMDb ID", style="dim", width=11)

    for i, m in enumerate(movies, 1):
        table.add_row(
            str(i),
            m.get("title", "Unknown"),
            str(m.get("year", "")),
            _format_rating(m.get("imdb_rating")),
            _format_number(m.get("imdb_votes")),
            str(m.get("trailer_count", 0)),
            _format_views(m.get("total_views")),
            m.get("imdb_id", ""),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# New trailers
# ---------------------------------------------------------------------------


def display_new_trailers(trailers: list[dict[str, Any]], days: int) -> None:
    """Display recently released trailers."""
    if not trailers:
        console.print(f"\n[yellow]No trailers published in the last {days} day(s).[/yellow]\n")
        return

    table = Table(
        title=f"New Trailers (last {days} day{'s' if days != 1 else ''})",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        show_lines=False,
        padding=(0, 1),
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Movie", style="bold white", min_width=15, max_width=35)
    table.add_column("Type", style="magenta", width=14)
    table.add_column("Lang", justify="center", width=5)
    table.add_column("Published", justify="center", width=12)
    table.add_column("Duration", justify="center", width=9)
    table.add_column("Views", justify="right", width=10)
    table.add_column("URL", style="dim")

    for i, t in enumerate(trailers, 1):
        yt_id = t.get("youtube_id", "")
        table.add_row(
            str(i),
            t.get("movie_title", ""),
            (t.get("trailer_type") or "").replace("_", " ").title(),
            t.get("language") or "",
            _format_date(t.get("published_at")),
            _format_duration(t.get("duration_seconds")),
            _format_views(t.get("view_count")),
            f"https://youtu.be/{yt_id}",
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------


def display_compare(movie1: dict[str, Any], movie2: dict[str, Any]) -> None:
    """Display side-by-side comparison of two movies."""
    console.print()

    table = Table(
        title="Movie Comparison",
        box=box.ROUNDED,
        title_style="bold cyan",
        header_style="bold",
        show_lines=True,
        padding=(0, 2),
    )
    table.add_column("", style="bold", width=20)
    table.add_column(movie1.get("title", "Movie 1"), style="cyan", min_width=20, max_width=35)
    table.add_column(movie2.get("title", "Movie 2"), style="magenta", min_width=20, max_width=35)

    # Basic info
    table.add_row("Year", str(movie1.get("year", "")), str(movie2.get("year", "")))
    table.add_row(
        "Rating",
        _format_rating(movie1.get("imdb_rating")),
        _format_rating(movie2.get("imdb_rating")),
    )
    table.add_row(
        "Votes",
        _format_number(movie1.get("imdb_votes")),
        _format_number(movie2.get("imdb_votes")),
    )

    r1 = movie1.get("runtime")
    r2 = movie2.get("runtime")
    table.add_row(
        "Runtime",
        f"{r1 // 60}h {r1 % 60}m" if r1 else "N/A",
        f"{r2 // 60}h {r2 % 60}m" if r2 else "N/A",
    )

    table.add_row(
        "Genres",
        ", ".join(movie1.get("genres", [])),
        ", ".join(movie2.get("genres", [])),
    )

    table.add_row(
        "Languages",
        ", ".join(movie1.get("languages", [])),
        ", ".join(movie2.get("languages", [])),
    )

    # Trailer stats
    s1 = movie1.get("trailer_stats", {})
    s2 = movie2.get("trailer_stats", {})

    table.add_row(
        "Trailers",
        _format_number(s1.get("trailer_count")),
        _format_number(s2.get("trailer_count")),
    )
    table.add_row(
        "Total Views",
        _format_views(s1.get("total_views")),
        _format_views(s2.get("total_views")),
    )
    table.add_row(
        "Total Likes",
        _format_views(s1.get("total_likes")),
        _format_views(s2.get("total_likes")),
    )
    table.add_row(
        "Avg Views",
        _format_views(int(s1.get("avg_views") or 0)),
        _format_views(int(s2.get("avg_views") or 0)),
    )
    table.add_row(
        "Max Views",
        _format_views(s1.get("max_views")),
        _format_views(s2.get("max_views")),
    )
    table.add_row(
        "Avg Duration",
        _format_duration(s1.get("avg_duration")),
        _format_duration(s2.get("avg_duration")),
    )
    table.add_row(
        "Language Count",
        str(s1.get("language_count", 0)),
        str(s2.get("language_count", 0)),
    )

    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Trailer info (by YouTube ID)
# ---------------------------------------------------------------------------


def display_trailer_info(info: dict[str, Any]) -> None:
    """Display detailed trailer info by YouTube ID."""
    yt_id = info.get("youtube_id", "")
    content_type = info.get("content_type", "movie")

    lines: list[str] = []

    if content_type == "movie":
        lines.append(f"[bold]Movie:[/bold]  [cyan]{info.get('movie_title', '')}[/cyan] ({info.get('year', '')})")
        lines.append(f"[bold]IMDb:[/bold]   {info.get('imdb_id', '')}")
    else:
        lines.append(f"[bold]Series:[/bold] [magenta]{info.get('series_name', '')}[/magenta]")
        lines.append(f"[bold]TMDB:[/bold]   {info.get('tmdb_id', '')}")

    lines.append("")
    t_type = (info.get("trailer_type") or "").replace("_", " ").title()
    lines.append(f"[bold]Type:[/bold]      [magenta]{t_type}[/magenta]")
    lines.append(f"[bold]Title:[/bold]     {info.get('title') or info.get('yt_title') or ''}")
    lines.append(f"[bold]Language:[/bold]  {info.get('language') or 'Unknown'}")
    lines.append(f"[bold]Region:[/bold]    {info.get('region') or ''}")
    lines.append(f"[bold]Official:[/bold]  {'Yes' if info.get('is_official') else 'No'}")
    lines.append(f"[bold]Published:[/bold] {_format_date(info.get('published_at'))}")
    lines.append(f"[bold]Channel:[/bold]   {info.get('channel_name') or ''}")
    lines.append(f"[bold]Duration:[/bold]  {_format_duration(info.get('duration_seconds'))}")
    lines.append("")
    lines.append(f"[bold green]{_format_number(info.get('view_count'))}[/bold green]  views")
    lines.append(f"[bold green]{_format_number(info.get('like_count'))}[/bold green]  likes")
    lines.append("")
    lines.append(f"[bold]URL:[/bold] https://www.youtube.com/watch?v={yt_id}")

    console.print()
    console.print(Panel(
        "\n".join(lines),
        title=f"[bold]Trailer: {yt_id}[/bold]",
        border_style="cyan",
        padding=(1, 2),
    ))

    # Subtitles
    subs = info.get("subtitles", [])
    if subs:
        sub_table = Table(
            title="Subtitles",
            box=box.SIMPLE_HEAD,
            title_style="bold",
            header_style="bold",
            padding=(0, 1),
        )
        sub_table.add_column("Language", width=12)
        sub_table.add_column("Type", width=16)
        for s in subs:
            sub_table.add_row(
                s.get("language", ""),
                "Auto-generated" if s.get("is_auto_generated") else "Manual",
            )
        console.print(sub_table)

    # Audio tracks
    tracks = info.get("audio_tracks", [])
    if tracks:
        audio_table = Table(
            title="Audio Tracks",
            box=box.SIMPLE_HEAD,
            title_style="bold",
            header_style="bold",
            padding=(0, 1),
        )
        audio_table.add_column("Language", width=12)
        audio_table.add_column("Name", width=20)
        audio_table.add_column("Original", width=10)
        for a in tracks:
            audio_table.add_row(
                a.get("language", ""),
                a.get("display_name") or "",
                "Yes" if a.get("is_original") else "No",
            )
        console.print(audio_table)

    # Formats
    formats = info.get("formats", [])
    if formats:
        fmt_table = Table(
            title="Available Formats",
            box=box.SIMPLE_HEAD,
            title_style="bold",
            header_style="bold",
            padding=(0, 1),
        )
        fmt_table.add_column("ID", width=8)
        fmt_table.add_column("Resolution", justify="center", width=12)
        fmt_table.add_column("Video", width=10)
        fmt_table.add_column("Audio", width=10)
        fmt_table.add_column("FPS", justify="center", width=6)
        fmt_table.add_column("Size", justify="right", width=10)
        for f in formats:
            h = f.get("height")
            w = f.get("width")
            res = f"{w}x{h}" if w and h else ""
            size = ""
            if f.get("filesize"):
                size_mb = f["filesize"] / 1_048_576
                size = f"{size_mb:.1f} MB" if size_mb >= 1 else f"{f['filesize'] / 1024:.0f} KB"
            fmt_table.add_row(
                f.get("format_id") or "",
                res,
                f.get("vcodec") or "",
                f.get("acodec") or "",
                str(int(f["fps"])) if f.get("fps") else "",
                size,
            )
        console.print(fmt_table)

    console.print()


# ---------------------------------------------------------------------------
# Analytics dashboard
# ---------------------------------------------------------------------------


def display_analytics(analytics: dict[str, Any]) -> None:
    """Display comprehensive analytics dashboard."""
    console.print()

    # Overview panel
    overview_lines: list[str] = []
    overview_lines.append(
        f"[bold green]{_format_number(analytics.get('total_movies'))}[/bold green]  movies  "
        f"[dim]({_format_number(analytics.get('movies_with_trailers'))} with trailers)[/dim]"
    )
    overview_lines.append(
        f"[bold green]{_format_number(analytics.get('total_trailers'))}[/bold green]  movie trailers"
    )
    overview_lines.append(
        f"[bold green]{_format_number(analytics.get('total_series'))}[/bold green]  TV series  "
        f"[dim]({_format_number(analytics.get('total_series_trailers'))} trailers)[/dim]"
    )
    overview_lines.append(
        f"[bold green]{_format_number(analytics.get('language_count'))}[/bold green]  languages"
    )
    overview_lines.append("")
    overview_lines.append(
        f"[bold cyan]{_format_views(analytics.get('total_views'))}[/bold cyan]  total YouTube views"
    )
    overview_lines.append(
        f"[bold cyan]{_format_views(analytics.get('total_likes'))}[/bold cyan]  total YouTube likes"
    )
    overview_lines.append(
        f"[bold cyan]{_format_views(int(analytics.get('avg_views') or 0))}[/bold cyan]  average views per trailer"
    )
    overview_lines.append(
        f"[bold cyan]{_format_duration(analytics.get('avg_duration'))}[/bold cyan]  average trailer duration"
    )

    console.print(Panel(
        "\n".join(overview_lines),
        title="[bold]TrailerDB Analytics[/bold]",
        border_style="green",
        padding=(1, 2),
    ))

    # Most viewed trailers
    most_viewed = analytics.get("most_viewed", [])
    if most_viewed:
        table = Table(
            title="Most Viewed Trailers",
            box=box.SIMPLE_HEAD,
            title_style="bold yellow",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Movie", style="bold white", min_width=20, max_width=35)
        table.add_column("Type", style="magenta", width=14)
        table.add_column("Views", justify="right", width=12)
        table.add_column("Likes", justify="right", width=10)
        table.add_column("URL", style="dim")

        max_views = most_viewed[0].get("view_count", 1) if most_viewed else 1
        for i, t in enumerate(most_viewed, 1):
            yt_id = t.get("youtube_id", "")
            table.add_row(
                str(i),
                f"{t.get('movie_title', '')} ({t.get('year', '')})",
                (t.get("trailer_type") or "").replace("_", " ").title(),
                _format_number(t.get("view_count")),
                _format_number(t.get("like_count")),
                f"https://youtu.be/{yt_id}",
            )

        console.print(table)
        console.print()

    # Top channels
    top_channels = analytics.get("top_channels", [])
    if top_channels:
        max_ch_count = top_channels[0].get("trailer_count", 1) if top_channels else 1
        table = Table(
            title="Top Channels",
            box=box.SIMPLE_HEAD,
            title_style="bold cyan",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Channel", style="bold white", min_width=20, max_width=35)
        table.add_column("Trailers", justify="right", width=10)
        table.add_column("Total Views", justify="right", width=14)
        table.add_column("", width=22)

        for i, ch in enumerate(top_channels, 1):
            bar = _sparkline(ch.get("trailer_count", 0), max_ch_count)
            table.add_row(
                str(i),
                ch.get("channel_name", ""),
                _format_number(ch.get("trailer_count")),
                _format_views(ch.get("total_views")),
                bar,
            )

        console.print(table)
        console.print()

    # Type breakdown
    by_type = analytics.get("by_type", [])
    if by_type:
        max_type_count = by_type[0].get("count", 1) if by_type else 1
        table = Table(
            title="Trailer Types",
            box=box.SIMPLE_HEAD,
            title_style="bold magenta",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("Type", style="magenta", width=20)
        table.add_column("Count", justify="right", width=10)
        table.add_column("", width=22)

        for t in by_type:
            bar = _sparkline(t.get("count", 0), max_type_count)
            table.add_row(
                (t.get("trailer_type") or "").replace("_", " ").title(),
                _format_number(t.get("count")),
                bar,
            )

        console.print(table)
        console.print()

    # Language breakdown
    top_langs = analytics.get("top_languages", [])
    if top_langs:
        max_lang_count = top_langs[0].get("count", 1) if top_langs else 1
        table = Table(
            title="Top Languages",
            box=box.SIMPLE_HEAD,
            title_style="bold cyan",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("Language", style="cyan", width=12)
        table.add_column("Count", justify="right", width=10)
        table.add_column("", width=22)

        for lang in top_langs:
            bar = _sparkline(lang.get("count", 0), max_lang_count)
            table.add_row(
                lang.get("language", ""),
                _format_number(lang.get("count")),
                bar,
            )

        console.print(table)
        console.print()


# ---------------------------------------------------------------------------
# Trailer URLs (for trailers command)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Stats (expanded)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# DB Info (expanded)
# ---------------------------------------------------------------------------


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
    lines.append(f"[bold green]{_format_number(info.get('total_trailers', 0))}[/bold green]  movie trailers")
    lines.append(f"[bold green]{_format_number(info.get('total_series', 0))}[/bold green]  TV series")
    lines.append(f"[bold green]{_format_number(info.get('total_series_trailers', 0))}[/bold green]  series trailers")
    lines.append(f"[bold green]{_format_number(info.get('languages', 0))}[/bold green]  languages")

    # YouTube engagement
    total_views = info.get("total_views", 0)
    total_likes = info.get("total_likes", 0)
    avg_duration = info.get("avg_duration", 0)
    if total_views:
        lines.append("")
        lines.append("[bold]YouTube Engagement[/bold]")
        lines.append(f"  [cyan]Total views:      {_format_views(total_views)}[/cyan]")
        lines.append(f"  [cyan]Total likes:      {_format_views(total_likes)}[/cyan]")
        lines.append(f"  [cyan]Avg duration:     {_format_duration(avg_duration)}[/cyan]")

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

    # Most viewed trailers
    most_viewed = info.get("most_viewed", [])
    if most_viewed:
        table = Table(
            title="Top 5 Most Viewed Trailers",
            box=box.SIMPLE_HEAD,
            title_style="bold yellow",
            header_style="bold",
            padding=(0, 1),
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Movie", style="bold white", min_width=20, max_width=35)
        table.add_column("Type", style="magenta", width=14)
        table.add_column("Views", justify="right", width=12)
        table.add_column("URL", style="dim")

        for i, t in enumerate(most_viewed, 1):
            yt_id = t.get("youtube_id", "")
            table.add_row(
                str(i),
                t.get("movie_title", ""),
                (t.get("trailer_type") or "").replace("_", " ").title(),
                _format_number(t.get("view_count")),
                f"https://youtu.be/{yt_id}",
            )

        console.print(table)

    console.print()


# ---------------------------------------------------------------------------
# Export results
# ---------------------------------------------------------------------------


def display_export_results(
    results: list[dict[str, Any]], format_type: str, output_path: str | None
) -> None:
    """Display export summary."""
    console.print(
        f"\n[green]Exported {len(results):,} trailers in {format_type} format"
        + (f" to [bold]{output_path}[/bold]" if output_path else "")
        + "[/green]\n"
    )


# ---------------------------------------------------------------------------
# Batch results
# ---------------------------------------------------------------------------


def display_batch_results(results: list[dict[str, Any]], output_path: str) -> None:
    """Display batch export summary."""
    console.print(
        f"\n[green]Wrote {len(results):,} URLs to [bold]{output_path}[/bold][/green]"
    )
    console.print(
        f"[dim]Download with: yt-dlp -a {output_path}[/dim]\n"
    )


# ---------------------------------------------------------------------------
# JSON output
# ---------------------------------------------------------------------------


def display_json(data: Any) -> None:
    """Pretty-print JSON output with syntax highlighting."""
    from rich.syntax import Syntax

    formatted = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    syntax = Syntax(formatted, "json", theme="monokai", line_numbers=False)
    console.print(syntax)


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------


def print_error(message: str) -> None:
    """Print an error message to stderr."""
    error_console.print(f"[bold red]Error:[/bold red] {message}")
