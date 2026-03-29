import { useMemo, useDeferredValue } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBrowseIndex } from '../lib/api'
import { searchMovies } from '../lib/search'
import { MovieGrid } from '../components/MovieGrid'
import { SEOHead } from '../components/SEOHead'
import { GridSkeleton } from '../components/Skeleton'

export function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const deferredQuery = useDeferredValue(query)
  const { data, isLoading } = useBrowseIndex()

  const results = useMemo(() => {
    if (!data) return []
    return searchMovies(data.movies, deferredQuery, 100)
  }, [data, deferredQuery])

  return (
    <>
      <SEOHead title={query ? `Search: ${query}` : 'Search'} />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-2">
          {query ? `Results for "${query}"` : 'Search'}
        </h1>
        <p className="text-text-muted text-sm font-body mb-8">
          {isLoading ? 'Loading...' : `${results.length} movies found`}
        </p>

        {isLoading ? <GridSkeleton /> : <MovieGrid movies={results} />}
      </div>
    </>
  )
}
