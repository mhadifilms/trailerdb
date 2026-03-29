import { useParams, Navigate } from 'react-router-dom'
import { useBrowseShard } from '../lib/api'
import { MovieGrid } from '../components/MovieGrid'
import { SEOHead } from '../components/SEOHead'
import { GridSkeleton } from '../components/Skeleton'

export function YearBrowse() {
  const { year } = useParams<{ year: string }>()
  const { data: movies, isLoading, error } = useBrowseShard(`year/${year}.json`)

  if (error) return <Navigate to="/browse" replace />

  return (
    <>
      <SEOHead
        title={`${year} Movies`}
        description={`Browse movies from ${year} with trailers on The Trailer Database.`}
      />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-2">{year} Movies</h1>
        <p className="text-text-muted text-sm font-body mb-8">
          {movies ? `${movies.length} movies` : 'Loading...'}
        </p>

        {isLoading ? <GridSkeleton /> : movies && <MovieGrid movies={movies} />}
      </div>
    </>
  )
}
