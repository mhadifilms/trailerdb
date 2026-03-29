import { useParams, Navigate } from 'react-router-dom'
import { useBrowseShard } from '../lib/api'
import { MovieGrid } from '../components/MovieGrid'
import { SEOHead } from '../components/SEOHead'
import { GridSkeleton } from '../components/Skeleton'

export function GenreBrowse() {
  const { genre } = useParams<{ genre: string }>()
  const { data: movies, isLoading, error } = useBrowseShard(`genre/${genre}.json`)

  if (error) return <Navigate to="/browse" replace />

  const genreName = genre ? genre.charAt(0).toUpperCase() + genre.slice(1).replace(/-/g, ' ') : ''

  return (
    <>
      <SEOHead
        title={`${genreName} Movies`}
        description={`Browse ${genreName.toLowerCase()} movies with trailers on The Trailer Database.`}
      />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-2">{genreName}</h1>
        <p className="text-text-muted text-sm font-body mb-8">
          {movies ? `${movies.length} movies` : 'Loading...'}
        </p>

        {isLoading ? <GridSkeleton /> : movies && <MovieGrid movies={movies} />}
      </div>
    </>
  )
}
