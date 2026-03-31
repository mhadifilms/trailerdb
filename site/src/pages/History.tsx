import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getWatchHistory, clearWatchHistory, type WatchHistoryEntry } from '../lib/storage'
import { useBrowseIndex } from '../lib/api'
import { youtubeThumbnail, timeAgo } from '../lib/utils'
import { SEOHead } from '../components/SEOHead'

export function History() {
  const [entries, setEntries] = useState<WatchHistoryEntry[]>(() => getWatchHistory())
  const { data } = useBrowseIndex()

  const handleClear = useCallback(() => {
    clearWatchHistory()
    setEntries([])
  }, [])

  // Build a lookup map for movie info
  const movieMap = new Map<string, { title: string; slug: string }>()
  if (data) {
    for (const m of data.movies) {
      movieMap.set(m.imdb_id, { title: m.title, slug: m.slug })
    }
  }

  return (
    <>
      <SEOHead title="Watch History" description="Trailers you've recently watched." />

      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-baseline justify-between mb-8">
            <div>
              <h1 className="font-display text-text-primary text-3xl md:text-4xl">Watch History</h1>
              {entries.length > 0 && (
                <p className="text-text-muted text-sm font-body mt-1">
                  {entries.length} {entries.length === 1 ? 'trailer' : 'trailers'} watched
                </p>
              )}
            </div>
            {entries.length > 0 && (
              <button
                onClick={handleClear}
                className="text-xs font-body text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                Clear history
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-bg-surface border border-border flex items-center justify-center">
                <svg className="w-7 h-7 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="font-display text-text-primary text-xl mb-2">No watch history yet</h2>
              <p className="text-text-muted font-body text-sm mb-6 max-w-sm mx-auto">
                When you play trailers, they'll appear here so you can find them again easily.
              </p>
              <Link
                to="/browse"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#383838] text-white text-sm font-body font-medium hover:bg-[#4a4a4a] transition-colors"
              >
                Browse Movies
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, i) => {
                const movie = movieMap.get(entry.movie_id)
                const thumb = youtubeThumbnail(entry.youtube_id, 'mq')
                const movieSlug = movie?.slug || entry.movie_id

                return (
                  <motion.div
                    key={`${entry.youtube_id}-${entry.timestamp}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.2) }}
                  >
                    <Link
                      to={`/movie/${movieSlug}#trailer-${entry.youtube_id}`}
                      className="flex gap-4 items-start p-3 -mx-3 rounded-xl hover:bg-bg-surface transition-colors group"
                    >
                      {/* Thumbnail */}
                      <div className="shrink-0 w-40 sm:w-48 aspect-video rounded-lg overflow-hidden bg-bg-surface">
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <h3 className="font-body font-semibold text-text-primary text-sm leading-tight truncate group-hover:text-text-muted transition-colors">
                          {movie?.title || entry.movie_id}
                        </h3>
                        <p className="text-text-muted text-xs font-body mt-1">
                          {timeAgo(entry.timestamp)}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>
    </>
  )
}
