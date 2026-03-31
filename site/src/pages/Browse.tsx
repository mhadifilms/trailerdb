import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBrowseIndex, useGenres } from '../lib/api'
import type { MovieIndex } from '../lib/types'
import { MovieGrid } from '../components/MovieGrid'
import { SEOHead } from '../components/SEOHead'
import { GridSkeleton } from '../components/Skeleton'

const PER_PAGE = 24

type SortKey = 'votes' | 'rating' | 'year' | 'trending' | 'trailers'

function sortMovies(movies: MovieIndex[], sort: SortKey): MovieIndex[] {
  const sorted = [...movies]
  switch (sort) {
    case 'votes': return sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0))
    case 'rating': return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    case 'year': return sorted.sort((a, b) => (b.year || 0) - (a.year || 0))
    case 'trending': return sorted.sort((a, b) => b.popularity - a.popularity)
    case 'trailers': return sorted.sort((a, b) => b.trailer_count - a.trailer_count)
    default: return sorted
  }
}

export function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading } = useBrowseIndex()
  const { data: genres } = useGenres()

  const genre = searchParams.get('genre') || ''
  const sort = (searchParams.get('sort') || 'votes') as SortKey
  const page = parseInt(searchParams.get('page') || '1', 10)
  const decade = searchParams.get('decade') || ''

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let movies = data.movies

    // Filter by genre
    if (genre) {
      const genreId = Object.entries(data.genres).find(([_, name]) =>
        name.toLowerCase().replace(/\s+/g, '-') === genre.toLowerCase()
      )?.[0]
      if (genreId) {
        movies = movies.filter((m) => m.genre_ids.includes(parseInt(genreId)))
      }
    }

    // Filter by decade
    if (decade) {
      const start = parseInt(decade)
      if (!isNaN(start)) {
        movies = movies.filter((m) => m.year && m.year >= start && m.year < start + 10)
      }
    }

    return sortMovies(movies, sort)
  }, [data, genre, sort, decade])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const pageMovies = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <>
      <SEOHead title="Browse Movies" description="Browse 105,000+ movies with 290,000+ trailers in 30 languages. Filter by genre, decade, and sort by rating, popularity, or trailer count." />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-6">Browse</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          {/* Genre filter */}
          <select
            value={genre}
            onChange={(e) => updateParam('genre', e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-secondary text-sm font-body cursor-pointer hover:border-border-hover transition-colors"
          >
            <option value="">All Genres</option>
            {genres?.map((g) => (
              <option key={g.id} value={g.slug}>{g.name} ({g.count.toLocaleString()})</option>
            ))}
          </select>

          {/* Decade filter */}
          <select
            value={decade}
            onChange={(e) => updateParam('decade', e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-secondary text-sm font-body cursor-pointer hover:border-border-hover transition-colors"
          >
            <option value="">All Decades</option>
            {[2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950].map((d) => (
              <option key={d} value={d}>{d}s</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-secondary text-sm font-body cursor-pointer hover:border-border-hover transition-colors"
          >
            <option value="votes">Most Popular</option>
            <option value="rating">Top Rated</option>
            <option value="year">Newest</option>
            <option value="trending">Trending</option>
            <option value="trailers">Most Trailers</option>
          </select>
        </div>

        {/* Results count */}
        <p className="text-text-muted text-sm font-body mb-4">
          {filtered.length.toLocaleString()} movies
        </p>

        {/* Grid */}
        {isLoading ? (
          <GridSkeleton />
        ) : (
          <>
            <MovieGrid movies={pageMovies} />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.set('page', String(page - 1))
                    setSearchParams(next)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="px-3 py-2 rounded-lg bg-bg-surface text-text-secondary text-sm font-body disabled:opacity-30 hover:bg-bg-hover transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-text-muted text-sm font-body px-4">
                  Page {page} of {totalPages.toLocaleString()}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.set('page', String(page + 1))
                    setSearchParams(next)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="px-3 py-2 rounded-lg bg-bg-surface text-text-secondary text-sm font-body disabled:opacity-30 hover:bg-bg-hover transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
