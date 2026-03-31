import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { SeriesIndex } from '../lib/types'
import { posterUrl } from '../lib/utils'
import { prefetchSeries } from '../lib/api'
import { RatingBadge } from './RatingBadge'

export function SeriesCard({ series, index = 0 }: { series: SeriesIndex; index?: number }) {
  const queryClient = useQueryClient()
  const poster = posterUrl(series.poster)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.25), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/series/${series.slug}`}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:rounded-xl"
        onMouseEnter={() => prefetchSeries(series.tmdb_id, queryClient)}
      >
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-bg-surface transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
          {poster ? (
            <img
              src={poster}
              alt={series.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-bg-surface">
              <svg className="w-10 h-10 text-text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="text-text-muted text-xs text-center font-body leading-tight">{series.name}</span>
            </div>
          )}
          {/* Trailer count */}
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 text-xs font-body font-medium px-1.5 py-0.5 rounded-full bg-white/80 text-text-secondary backdrop-blur-sm">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              {series.trailer_count}
            </span>
          </div>
        </div>
        <div className="mt-2.5 px-0.5">
          <h3 className="font-body font-semibold text-text-primary text-sm leading-tight truncate group-hover:text-text-muted transition-colors">
            {series.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-text-muted text-xs font-body">{series.year}</span>
            <RatingBadge rating={series.rating} size="sm" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
