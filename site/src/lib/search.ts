import type { MovieIndex } from './types'

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

/** Detect Mac platform without deprecated navigator.platform */
export function isMac(): boolean {
  return (navigator as any).userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent)
}
