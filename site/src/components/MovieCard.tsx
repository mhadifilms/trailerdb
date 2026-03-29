import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { MovieIndex } from '../lib/types'
import { posterUrl } from '../lib/utils'
import { prefetchMovie } from '../lib/api'
import { RatingBadge } from './RatingBadge'

export function MovieCard({ movie, index = 0 }: { movie: MovieIndex; index?: number }) {
  const queryClient = useQueryClient()
  const poster = posterUrl(movie.poster)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.25), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/movie/${movie.slug}`}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:rounded-xl"
        onMouseEnter={() => prefetchMovie(movie.imdb_id, queryClient)}
      >
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-bg-surface transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
          {poster ? (
            <img
              src={poster}
              alt={movie.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-bg-surface">
              <svg className="w-10 h-10 text-text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625" />
              </svg>
              <span className="text-text-muted text-xs text-center font-body leading-tight">{movie.title}</span>
            </div>
          )}
          {/* Trailer count */}
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 text-xs font-body font-medium px-1.5 py-0.5 rounded-full bg-white/80 text-text-secondary backdrop-blur-sm">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              {movie.trailer_count}
            </span>
          </div>
        </div>
        <div className="mt-2.5 px-0.5">
          <h3 className="font-body font-semibold text-text-primary text-sm leading-tight truncate group-hover:text-text-muted transition-colors">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-text-muted text-xs font-body">{movie.year}</span>
            <RatingBadge rating={movie.rating} size="sm" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
