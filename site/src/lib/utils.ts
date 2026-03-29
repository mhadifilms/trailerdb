import type { MovieIndex, BrowseIndex } from './types'

/** Parse the compact array-of-arrays index into MovieIndex objects */
export function parseIndex(data: BrowseIndex): { movies: MovieIndex[]; genres: Record<string, string> } {
  const movies: MovieIndex[] = data.movies.map((m) => ({
    imdb_id: m[0] as string,
    title: m[1] as string,
    year: m[2] as number | null,
    rating: m[3] as number | null,
    votes: m[4] as number | null,
    poster: m[5] as string | null,
    genre_ids: m[6] as number[],
    tmdb_id: m[7] as number | null,
    slug: m[8] as string,
    trailer_count: m[9] as number,
    popularity: m[10] as number,
  }))
  return { movies, genres: data.genres }
}

/** Parse a browse shard array into MovieIndex objects */
export function parseShard(data: (string | number | number[] | null)[][]): MovieIndex[] {
  return data.map((m) => ({
    imdb_id: m[0] as string,
    title: m[1] as string,
    year: m[2] as number | null,
    rating: m[3] as number | null,
    votes: m[4] as number | null,
    poster: m[5] as string | null,
    genre_ids: m[6] as number[],
    tmdb_id: m[7] as number | null,
    slug: m[8] as string,
    trailer_count: m[9] as number,
    popularity: (m[10] as number) || 0,
  }))
}

/** Extract IMDb ID from a movie slug */
export function imdbIdFromSlug(slug: string): string | null {
  const match = slug.match(/(tt\d+)$/)
  return match ? match[1]! : null
}

/** Build TMDB poster URL */
export function posterUrl(path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

/** Build TMDB backdrop URL */
export function backdropUrl(path: string | null, size: 'w780' | 'w1280' = 'w1280'): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

/** Build YouTube thumbnail URL */
export function youtubeThumbnail(id: string, quality: 'mq' | 'hq' | 'maxres' = 'mq'): string {
  const file = quality === 'maxres' ? 'maxresdefault' : quality === 'hq' ? 'hqdefault' : 'mqdefault'
  return `https://img.youtube.com/vi/${id}/${file}.jpg`
}

/** Format runtime as "2h 32m" */
export function formatRuntime(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Format vote count as "1.2M" */
export function formatVotes(votes: number | null): string {
  if (!votes) return '0'
  if (votes >= 1_000_000) return `${(votes / 1_000_000).toFixed(1)}M`
  if (votes >= 1_000) return `${(votes / 1_000).toFixed(0)}K`
  return votes.toString()
}

/** Format view count */
export function formatViews(views: number | null): string | null {
  if (!views) return null
  return `${formatVotes(views)} views`
}

/** Get rating color class */
export function ratingColor(rating: number | null): string {
  if (rating == null) return 'text-text-muted'
  if (rating >= 7) return 'text-rating-green'
  if (rating >= 5) return 'text-rating-gold'
  return 'text-rating-red'
}

/** Format date as "Mar 15, 2024" */
export function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return null
  }
}
