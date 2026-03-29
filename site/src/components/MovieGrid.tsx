import type { MovieIndex } from '../lib/types'
import { MovieCard } from './MovieCard'

export function MovieGrid({ movies }: { movies: MovieIndex[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
      {movies.map((movie, i) => (
        <MovieCard key={movie.imdb_id} movie={movie} index={i} />
      ))}
    </div>
  )
}
