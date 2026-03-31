import { useState, useMemo } from 'react'
import { useAnalytics, useMovieDetail } from '../../lib/api'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS, TRAILER_TYPE_CONFIG } from '../../lib/constants'
import { MovieSearchInput } from '../../components/analytics/MovieSearchInput'
import { ComparisonTable, type ComparisonItem, type MetricDef, formatNum } from '../../components/analytics/ComparisonTable'
import type { TrailerType, AnalyticsData } from '../../lib/types'

/* ---------- Comparison types ---------- */

type CompareType = 'movies' | 'genres' | 'languages' | 'channels'

const COMPARE_TYPES: { id: CompareType; label: string }[] = [
  { id: 'movies', label: 'Movies' },
  { id: 'genres', label: 'Genres' },
  { id: 'languages', label: 'Languages' },
  { id: 'channels', label: 'Channels' },
]

/* ---------- Movie metric defs ---------- */

const MOVIE_METRIC_DEFS: MetricDef[] = [
  { key: 'totalViews', label: 'Total Views', format: (v) => formatNum(Number(v)) },
  { key: 'trailerCount', label: 'Trailer Count', format: (v) => String(v) },
  { key: 'avgViews', label: 'Avg Views / Trailer', format: (v) => formatNum(Number(v)) },
  { key: 'languages', label: 'Languages', format: (v) => String(v) },
  { key: 'types', label: 'Trailer Types', format: (v) => String(v) },
]

/* ---------- Category metric defs ---------- */

const CATEGORY_METRIC_DEFS: MetricDef[] = [
  { key: 'count', label: 'Trailer Count', format: (v) => formatNum(Number(v)) },
  { key: 'totalViews', label: 'Total Views', format: (v) => formatNum(Number(v)) },
  { key: 'avgViews', label: 'Avg Views', format: (v) => formatNum(Number(v)) },
  { key: 'totalLikes', label: 'Total Likes', format: (v) => formatNum(Number(v)) },
  { key: 'avgLikes', label: 'Avg Likes', format: (v) => formatNum(Number(v)) },
]

/* ---------- MovieSlot ---------- */

function MovieSlot({
  index,
  selection,
  onSelect,
  onRemove,
}: {
  index: number
  selection: { imdbId: string; title: string } | null
  onSelect: (imdbId: string, title: string) => void
  onRemove: () => void
}) {
  if (selection) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-surface border border-border">
        <span className="text-sm font-body font-medium text-text-primary truncate flex-1">
          {selection.title}
        </span>
        <button
          onClick={onRemove}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <MovieSearchInput
      onSelect={onSelect}
      placeholder={`Movie ${index + 1}...`}
      className="flex-1"
    />
  )
}

/* ---------- CategorySelect ---------- */

function CategorySelect({
  options,
  selected,
  onToggle,
  maxSelections = 3,
}: {
  options: string[]
  selected: string[]
  onToggle: (item: string) => void
  maxSelections?: number
}) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
      {options.map((opt) => {
        const isSelected = selected.includes(opt)
        const isDisabled = !isSelected && selected.length >= maxSelections
        return (
          <button
            key={opt}
            onClick={() => !isDisabled && onToggle(opt)}
            disabled={isDisabled}
            className={`px-2.5 py-1 rounded-full text-xs font-body font-medium transition-all cursor-pointer whitespace-nowrap ${
              isSelected
                ? 'bg-text-primary text-bg-base'
                : isDisabled
                  ? 'bg-bg-surface text-text-muted/50 border border-border cursor-not-allowed'
                  : 'bg-bg-surface text-text-secondary border border-border hover:border-text-muted/50 hover:text-text-primary'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- MovieCompareResults ---------- */

function MovieCompareResults({ imdbIds }: { imdbIds: { imdbId: string; title: string }[] }) {
  const movieQueries = imdbIds.map((m) => useMovieDetail(m.imdbId))

  const allLoaded = movieQueries.every((q) => !q.isLoading)
  const anyError = movieQueries.some((q) => q.error)

  if (!allLoaded) {
    return (
      <div className="space-y-4 py-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-xl" />
        ))}
      </div>
    )
  }

  if (anyError) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted font-body text-sm">Failed to load one or more movies.</p>
      </div>
    )
  }

  const items: ComparisonItem[] = movieQueries.map((q, i) => {
    const movie = q.data!
    const totalViews = movie.trailers.reduce((s, t) => s + (t.views ?? 0), 0)
    const uniqueLangs = new Set(movie.trailers.map((t) => t.language).filter(Boolean)).size
    const uniqueTypes = new Set(movie.trailers.map((t) => t.type)).size
    const avgViews = movie.trailers.length > 0 ? Math.round(totalViews / movie.trailers.length) : 0

    return {
      name: imdbIds[i]!.title,
      metrics: {
        totalViews,
        trailerCount: movie.trailers.length,
        avgViews,
        languages: uniqueLangs,
        types: uniqueTypes,
      },
    }
  })

  return <ComparisonTable items={items} metricDefs={MOVIE_METRIC_DEFS} />
}

/* ---------- CategoryCompareResults ---------- */

function CategoryCompareResults({
  compareType,
  selectedItems,
  analytics,
}: {
  compareType: CompareType
  selectedItems: string[]
  analytics: AnalyticsData
}) {
  const items: ComparisonItem[] = useMemo(() => {
    if (compareType === 'languages') {
      return selectedItems.map((lang) => {
        const data = analytics.by_language.find((l) => l.lang === lang)
        return {
          name: `${LANGUAGE_FLAGS[lang] || ''} ${LANGUAGE_NAMES[lang] || lang}`,
          metrics: {
            count: data?.count ?? 0,
            totalViews: data?.total_views ?? 0,
            avgViews: data?.avg_views ?? 0,
            totalLikes: data?.total_likes ?? 0,
            avgLikes: data?.avg_likes ?? 0,
          },
        }
      })
    }

    if (compareType === 'channels') {
      return selectedItems.map((ch) => {
        const data = analytics.top_channels_by_views.find((c) => c.name === ch)
        return {
          name: ch,
          metrics: {
            count: data?.trailers ?? 0,
            totalViews: data?.views ?? 0,
            avgViews: data?.avg_per_trailer ?? 0,
            totalLikes: 0,
            avgLikes: 0,
          },
        }
      })
    }

    if (compareType === 'genres') {
      // Use type_by_genre data
      return selectedItems.map((genre) => {
        const data = analytics.type_by_genre.find((g) => g.genre === genre)
        const totalTrailers = data
          ? Object.entries(data)
              .filter(([k]) => k !== 'genre')
              .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0)
          : 0
        return {
          name: genre,
          metrics: {
            count: totalTrailers,
            totalViews: 0,
            avgViews: 0,
            totalLikes: 0,
            avgLikes: 0,
          },
        }
      })
    }

    return []
  }, [compareType, selectedItems, analytics])

  if (items.length === 0) return null

  return <ComparisonTable items={items} metricDefs={CATEGORY_METRIC_DEFS} />
}

/* ---------- CompareView main ---------- */

export function CompareView() {
  const { data: analytics, isLoading } = useAnalytics()
  const [compareType, setCompareType] = useState<CompareType>('movies')
  const [movieSlots, setMovieSlots] = useState<({ imdbId: string; title: string } | null)[]>([
    null,
    null,
  ])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showResults, setShowResults] = useState(false)

  // Category options
  const categoryOptions = useMemo(() => {
    if (!analytics) return []
    if (compareType === 'languages') {
      return analytics.by_language.map((l) => l.lang).sort()
    }
    if (compareType === 'channels') {
      return analytics.top_channels_by_views.map((c) => c.name)
    }
    if (compareType === 'genres') {
      return analytics.type_by_genre.map((g) => g.genre as string).sort()
    }
    return []
  }, [analytics, compareType])

  function handleCompareTypeChange(type: CompareType) {
    setCompareType(type)
    setSelectedCategories([])
    setShowResults(false)
    setMovieSlots([null, null])
  }

  function toggleCategory(item: string) {
    setSelectedCategories((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    )
    setShowResults(false)
  }

  function handleMovieSelect(index: number, imdbId: string, title: string) {
    const next = [...movieSlots]
    next[index] = { imdbId, title }
    setMovieSlots(next)
    setShowResults(false)
  }

  function handleRemoveMovie(index: number) {
    const next = [...movieSlots]
    next[index] = null
    setMovieSlots(next)
    setShowResults(false)
  }

  function addMovieSlot() {
    if (movieSlots.length < 3) {
      setMovieSlots([...movieSlots, null])
    }
  }

  const canCompare =
    compareType === 'movies'
      ? movieSlots.filter(Boolean).length >= 2
      : selectedCategories.length >= 2

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-60 rounded-xl" />
      </div>
    )
  }

  return (
    <div>
      {/* Selection bar */}
      <div className="rounded-xl border border-border p-5 mb-8 bg-bg-surface/50">
        {/* Compare type toggle */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mr-2">
            Compare
          </span>
          {COMPARE_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => handleCompareTypeChange(ct.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-all cursor-pointer ${
                compareType === ct.id
                  ? 'bg-text-primary text-bg-base'
                  : 'text-text-secondary hover:text-text-primary border border-border hover:border-text-muted/50'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>

        {/* Selection inputs */}
        {compareType === 'movies' ? (
          <div className="space-y-2">
            {movieSlots.map((slot, i) => (
              <MovieSlot
                key={i}
                index={i}
                selection={slot}
                onSelect={(imdbId, title) => handleMovieSelect(i, imdbId, title)}
                onRemove={() => handleRemoveMovie(i)}
              />
            ))}
            {movieSlots.length < 3 && (
              <button
                onClick={addMovieSlot}
                className="text-xs font-body font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                + Add another movie
              </button>
            )}
          </div>
        ) : (
          <CategorySelect
            options={categoryOptions}
            selected={selectedCategories}
            onToggle={toggleCategory}
          />
        )}

        {/* Compare button */}
        <div className="mt-4">
          <button
            onClick={() => setShowResults(true)}
            disabled={!canCompare}
            className={`px-6 py-2 rounded-full text-sm font-body font-medium transition-all ${
              canCompare
                ? 'bg-text-primary text-bg-base hover:bg-text-primary/90 cursor-pointer'
                : 'bg-bg-surface text-text-muted border border-border cursor-not-allowed'
            }`}
          >
            Compare
          </button>
          {!canCompare && (
            <span className="ml-3 text-xs font-body text-text-muted">
              Select at least 2 items to compare
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {showResults && (
        <div>
          {compareType === 'movies' ? (
            <MovieCompareResults
              imdbIds={movieSlots.filter((s): s is { imdbId: string; title: string } => s !== null)}
            />
          ) : analytics ? (
            <CategoryCompareResults
              compareType={compareType}
              selectedItems={selectedCategories}
              analytics={analytics}
            />
          ) : null}
        </div>
      )}

      {/* Empty state */}
      {!showResults && (
        <div className="text-center py-16 rounded-xl bg-bg-surface border border-border">
          <div className="font-display text-text-primary text-xl mb-2">Side-by-Side Comparison</div>
          <p className="text-text-muted font-body text-sm max-w-md mx-auto">
            Select {compareType === 'movies' ? 'movies' : compareType} above to compare their trailer analytics head-to-head.
          </p>
        </div>
      )}
    </div>
  )
}
