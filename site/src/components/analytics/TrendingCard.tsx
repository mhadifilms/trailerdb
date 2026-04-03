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
    <div className="flex items-start gap-3 p-3 rounded-xl bg-bg-base border border-border hover:border-text-muted/30 transition-all group">
      {/* Poster thumbnail — clicks to deep dive */}
      <button onClick={handleClick} className="w-10 h-[60px] shrink-0 rounded overflow-hidden bg-bg-surface cursor-pointer">
        {poster ? (
          <img src={poster} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px] font-body">N/A</div>
        )}
      </button>

      {/* Content — clicks to deep dive */}
      <button onClick={handleClick} className="flex-1 min-w-0 text-left cursor-pointer">
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
      </button>

      {/* Watch on YouTube icon */}
      <a
        href={`https://www.youtube.com/watch?v=${trailer.youtube_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 mt-2 p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-bg-surface"
        title="Watch on YouTube"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    </div>
  )
}
