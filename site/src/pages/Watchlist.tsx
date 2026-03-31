import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useBrowseIndex } from '../lib/api'
import { getWatchlist, clearWatchlist, removeFromWatchlist } from '../lib/storage'
import { posterUrl } from '../lib/utils'
import { RatingBadge } from '../components/RatingBadge'
import { SEOHead } from '../components/SEOHead'

export function Watchlist() {
  const [ids, setIds] = useState(() => getWatchlist())
  const { data } = useBrowseIndex()

  const movies = useMemo(() => {
    if (!data) return []
    return ids
      .map((id) => data.movies.find((m) => m.imdb_id === id))
      .filter(Boolean) as typeof data.movies
  }, [ids, data])

  const handleClearAll = useCallback(() => {
    clearWatchlist()
    setIds([])
  }, [])

  const handleRemove = useCallback((id: string) => {
    removeFromWatchlist(id)
    setIds((prev) => prev.filter((i) => i !== id))
  }, [])

  return (
    <>
      <SEOHead title="Your Watchlist" description="Movies and series you want to watch trailers for." />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-baseline justify-between mb-8">
            <div>
              <h1 className="font-display text-text-primary text-3xl md:text-4xl">Watchlist</h1>
              {ids.length > 0 && (
                <p className="text-text-muted text-sm font-body mt-1">{ids.length} {ids.length === 1 ? 'title' : 'titles'}</p>
              )}
            </div>
            {ids.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-body text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {ids.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-bg-surface border border-border flex items-center justify-center">
                <svg className="w-7 h-7 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <h2 className="font-display text-text-primary text-xl mb-2">Your watchlist is empty</h2>
              <p className="text-text-muted font-body text-sm mb-6 max-w-sm mx-auto">
                Browse movies and tap the heart icon to save them here for easy access.
              </p>
              <Link
                to="/browse"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#383838] text-white text-sm font-body font-medium hover:bg-[#4a4a4a] transition-colors"
              >
                Browse Movies
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
              {movies.map((movie, i) => (
                <motion.div
                  key={movie.imdb_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.25) }}
                  className="relative group"
                >
                  <Link
                    to={`/movie/${movie.slug}`}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:rounded-xl"
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-bg-surface transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
                      {posterUrl(movie.poster) ? (
                        <img
                          src={posterUrl(movie.poster)!}
                          alt={movie.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-bg-surface">
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
                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(movie.imdb_id)}
                    className="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
                    aria-label={`Remove ${movie.title} from watchlist`}
                    title="Remove from watchlist"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
              {/* Show IDs that weren't found in the index (edge case) */}
              {ids
                .filter((id) => !movies.find((m) => m.imdb_id === id))
                .map((id) => (
                  <div key={id} className="relative">
                    <Link
                      to={`/movie/${id}`}
                      className="block aspect-[2/3] rounded-xl bg-bg-surface border border-border flex items-center justify-center"
                    >
                      <span className="text-text-muted text-xs font-body">{id}</span>
                    </Link>
                    <button
                      onClick={() => handleRemove(id)}
                      className="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white/80 hover:text-white cursor-pointer"
                      aria-label="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
          )}
        </motion.div>
      </div>
    </>
  )
}
