import type { MovieIndex, SeriesIndex } from './types'

export function searchMovies(movies: MovieIndex[], query: string, limit: number = 8): MovieIndex[] {
  if (!query || query.length < 2) return []
  const lower = query.toLowerCase()
  const terms = lower.split(/\s+/).filter(Boolean)

  const scored: { movie: MovieIndex; score: number }[] = []

  for (const movie of movies) {
    const title = movie.title.toLowerCase()
    const yearStr = movie.year?.toString() || ''

    const allMatch = terms.every((t) => title.includes(t) || yearStr.includes(t))
    if (!allMatch) continue

    let score = 0
    if (title === lower) score = 1_000_000_000
    else if (title.startsWith(lower)) score = 100_000_000
    score += Math.log10(Math.max(movie.votes || 1, 1)) * 1_000_000

    scored.push({ movie, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.movie)
}

export function searchSeries(series: SeriesIndex[], query: string, limit: number = 8): SeriesIndex[] {
  if (!query || query.length < 2) return []
  const lower = query.toLowerCase()
  const terms = lower.split(/\s+/).filter(Boolean)

  const scored: { item: SeriesIndex; score: number }[] = []

  for (const item of series) {
    const name = item.name.toLowerCase()
    const yearStr = item.year?.toString() || ''

    const allMatch = terms.every((t) => name.includes(t) || yearStr.includes(t))
    if (!allMatch) continue

    let score = 0
    if (name === lower) score = 1_000_000_000
    else if (name.startsWith(lower)) score = 100_000_000
    score += Math.log10(Math.max(item.votes || 1, 1)) * 1_000_000

    scored.push({ item, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.item)
}

/** Detect Mac platform without deprecated navigator.platform */
export function isMac(): boolean {
  return (navigator as any).userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent)
}
