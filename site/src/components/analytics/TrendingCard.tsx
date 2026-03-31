import { useSearchParams } from 'react-router-dom'
import type { TrendingTrailer } from '../../lib/types'
import type { TrailerType } from '../../lib/types'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../../lib/constants'
import { posterUrl, formatVotes } from '../../lib/utils'

interface TrendingCardProps {
  trailer: TrendingTrailer
}

function TypeBadge({ type }: { type: string }) {
  const config = TRAILER_TYPE_CONFIG[type as TrailerType]
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-body font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: config?.color || '#a4a4a4' }}
    >
      {config?.label || type}
    </span>
  )
}

function VelocityBadge({ velocity }: { velocity: number }) {
  const formatted =
    velocity >= 1_000_000
      ? `${(velocity / 1_000_000).toFixed(1)}M`
      : velocity >= 1_000
        ? `${(velocity / 1_000).toFixed(0)}K`
        : velocity.toFixed(0)

  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-bg-surface text-[9px] font-body font-semibold text-text-primary whitespace-nowrap border border-border">
      <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0" aria-hidden="true">
        <path d="M4 1 L7 5 L5 5 L5 7 L3 7 L3 5 L1 5 Z" fill="currentColor" />
      </svg>
      {formatted}/day
    </span>
  )
}

export function TrendingCard({ trailer }: TrendingCardProps) {
  const [, setSearchParams] = useSearchParams()
  const poster = trailer.poster ? posterUrl(trailer.poster, 'w185') : null

  function handleClick() {
    setSearchParams({ movie: trailer.imdb_id })
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-start gap-3 p-3 rounded-xl bg-bg-base border border-border hover:border-text-muted/30 transition-all w-full text-left cursor-pointer group"
    >
      {/* Poster thumbnail */}
      <div className="w-10 h-[60px] shrink-0 rounded overflow-hidden bg-bg-surface">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px] font-body">
            N/A
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-body font-medium text-sm text-text-primary truncate group-hover:text-text-primary/80 transition-colors">
          {trailer.movie}
        </div>
        <div className="text-text-muted text-xs font-body truncate mt-0.5">
          {trailer.trailer}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-xs font-body text-text-secondary tabular-nums">
            {formatVotes(trailer.views)} views
          </span>
          <VelocityBadge velocity={trailer.velocity} />
          <TypeBadge type={trailer.type} />
          {trailer.lang && (
            <span className="text-xs font-body text-text-muted">
              {LANGUAGE_FLAGS[trailer.lang] || ''}{' '}
              {LANGUAGE_NAMES[trailer.lang] || trailer.lang}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
