import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Trailer, TrailerType, TrailerGroup } from '../lib/types'
import { TRAILER_TYPE_CONFIG, TRAILER_TYPE_ORDER } from '../lib/constants'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { TrailerPlayer } from './TrailerPlayer'
import { TypeBadge } from './Badge'
import { formatDate } from '../lib/utils'

const INITIAL_SHOW = 3
const LOAD_MORE_INCREMENT = 6

/** A single trailer group with language switcher */
function GroupedTrailerCard({ group, movieId, onShare }: { group: TrailerGroup; movieId?: string; onShare?: (youtubeId: string) => void }) {
  const langs = Object.keys(group.languages)
  const [activeLang, setActiveLang] = useState(langs.includes('en') ? 'en' : langs[0] || 'en')
  const active = group.languages[activeLang] || Object.values(group.languages)[0]

  if (!active) return null

  return (
    <article className="group" id={`trailer-${active.youtube_id}`}>
      <TrailerPlayer youtubeId={active.youtube_id} title={active.title} movieId={movieId} onShare={onShare} />
      <div className="mt-2 px-0.5">
        <h4 className="text-text-primary text-sm font-body font-medium leading-tight line-clamp-2">
          {group.title || active.title || 'Untitled'}
        </h4>
        {/* Language switcher — only show if multiple languages */}
        {langs.length > 1 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {langs.map((lang) => {
              const flag = LANGUAGE_FLAGS[lang] || ''
              const isActive = lang === activeLang
              return (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-body transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#383838] text-white'
                      : 'bg-bg-surface text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                  }`}
                  title={LANGUAGE_NAMES[lang] || lang}
                >
                  {flag} {lang.toUpperCase()}
                </button>
              )
            })}
          </div>
        )}
        {langs.length === 1 && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-text-muted font-body">
              {LANGUAGE_FLAGS[langs[0]!]} {LANGUAGE_NAMES[langs[0]!] || langs[0]!.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}

/** Fallback: plain trailer card (no grouping) */
function PlainTrailerCard({ trailer, movieId, onShare }: { trailer: Trailer; movieId?: string; onShare?: (youtubeId: string) => void }) {
  return (
    <article id={`trailer-${trailer.youtube_id}`}>
      <TrailerPlayer youtubeId={trailer.youtube_id} title={trailer.title} movieId={movieId} onShare={onShare} />
      <div className="mt-2 px-0.5">
        <h4 className="text-text-primary text-sm font-body font-medium leading-tight line-clamp-2">
          {trailer.title || 'Untitled'}
        </h4>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <TypeBadge type={trailer.type} />
          {trailer.language && (
            <span className="text-xs text-text-muted font-body">
              {LANGUAGE_FLAGS[trailer.language]} {LANGUAGE_NAMES[trailer.language] || trailer.language.toUpperCase()}
            </span>
          )}
          {trailer.published_at && (
            <span className="text-xs text-text-muted font-body">{formatDate(trailer.published_at)}</span>
          )}
        </div>
      </div>
    </article>
  )
}

function TypeGroupSection({ type, groups, fallbackTrailers, movieId, onShare }: {
  type: TrailerType
  groups: TrailerGroup[]
  fallbackTrailers: Trailer[]
  movieId?: string
  onShare?: (youtubeId: string) => void
}) {
  const config = TRAILER_TYPE_CONFIG[type]
  const items = groups.length > 0 ? groups : null
  const totalCount = items ? items.length : fallbackTrailers.length
  const [showCount, setShowCount] = useState(INITIAL_SHOW)
  const remaining = totalCount - showCount
  const hasMore = remaining > 0

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-3">
          <span className="w-1 h-5 rounded-full" style={{ backgroundColor: config?.color }} />
          <span className="font-display text-text-primary text-lg">{config?.label || type}</span>
          <span className="text-text-muted text-sm font-body">({totalCount})</span>
        </h3>
        {totalCount > INITIAL_SHOW && showCount < totalCount && (
          <button
            onClick={() => setShowCount(totalCount)}
            className="text-text-muted hover:text-text-primary text-xs font-body transition-colors cursor-pointer"
          >
            Show all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {items
            ? items.slice(0, showCount).map((g) => (
                <motion.div key={g.group_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} layout>
                  <GroupedTrailerCard group={g} movieId={movieId} onShare={onShare} />
                </motion.div>
              ))
            : fallbackTrailers.slice(0, showCount).map((t) => (
                <motion.div key={t.youtube_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} layout>
                  <PlainTrailerCard trailer={t} movieId={movieId} onShare={onShare} />
                </motion.div>
              ))
          }
        </AnimatePresence>
      </div>

      {hasMore && (
        <button
          onClick={() => setShowCount((c) => Math.min(c + LOAD_MORE_INCREMENT, totalCount))}
          className="mt-4 w-full py-2.5 rounded-xl border border-border hover:border-border-hover bg-bg-surface hover:bg-bg-overlay text-text-secondary text-sm font-body font-medium transition-all cursor-pointer"
        >
          Show {Math.min(remaining, LOAD_MORE_INCREMENT)} more
          <span className="text-text-muted ml-1">({remaining} remaining)</span>
        </button>
      )}
    </section>
  )
}

export function TrailerSection({ trailers, trailerGroups, filterLanguage, movieId, onShare }: {
  trailers: Trailer[]
  trailerGroups?: TrailerGroup[]
  filterLanguage?: string | null
  movieId?: string
  onShare?: (youtubeId: string) => void
}) {
  // Group trailer_groups by type, filtering by language if set
  const groupsByType = new Map<TrailerType, TrailerGroup[]>()
  if (trailerGroups && trailerGroups.length > 0) {
    for (const g of trailerGroups) {
      // If filtering by language, only show groups that have that language
      if (filterLanguage && !g.languages[filterLanguage]) continue
      const list = groupsByType.get(g.type) || []
      list.push(g)
      groupsByType.set(g.type, list)
    }
  }

  // Fallback: group flat trailers by type
  const flatByType = new Map<TrailerType, Trailer[]>()
  for (const t of trailers) {
    if (filterLanguage && t.language !== filterLanguage) continue
    const list = flatByType.get(t.type) || []
    list.push(t)
    flatByType.set(t.type, list)
  }

  // Get all types present
  const allTypes = new Set<TrailerType>()
  groupsByType.forEach((_, t) => allTypes.add(t))
  flatByType.forEach((_, t) => allTypes.add(t))

  const sortedTypes = TRAILER_TYPE_ORDER.filter((t) => allTypes.has(t))

  if (sortedTypes.length === 0) {
    return (
      <p className="text-text-muted text-sm font-body py-8 text-center">
        No trailers available.
      </p>
    )
  }

  return (
    <div>
      {sortedTypes.map((type) => (
        <TypeGroupSection
          key={type}
          type={type}
          groups={groupsByType.get(type) || []}
          fallbackTrailers={flatByType.get(type) || []}
          movieId={movieId}
          onShare={onShare}
        />
      ))}
    </div>
  )
}
