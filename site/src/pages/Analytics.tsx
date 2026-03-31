import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSiteStats, useBrowseIndex, useBrowseShard, useMovieDetail } from '../lib/api'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { ratingColor, youtubeThumbnail } from '../lib/utils'
import { SEOHead } from '../components/SEOHead'
import type { TrailerType, MovieIndex } from '../lib/types'

/* ---------- helpers ---------- */

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatNumCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

/* ---------- sub-components ---------- */

function StatCard({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
  return (
    <div className="p-6 rounded-xl bg-bg-surface border border-border">
      <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">{value}</div>
      <div className="text-text-muted text-xs uppercase tracking-widest mt-2 font-body">{label}</div>
      {sublabel && <div className="text-text-muted text-xs mt-1 font-body">{sublabel}</div>}
    </div>
  )
}

function HBar({ label, value, max, total, color }: { label: string; value: number; max: number; total: number; color?: string }) {
  const w = max > 0 ? Math.max((value / max) * 100, 0.5) : 0
  return (
    <div className="group flex items-center gap-3 py-2">
      <span className="w-36 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">{label}</span>
      <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${w}%`, backgroundColor: color || '#000' }}
        />
      </div>
      <span className="w-20 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
        {formatNum(value)} <span className="opacity-60">({pct(value, total)})</span>
      </span>
    </div>
  )
}

function DurationBar({ label, seconds, max, color, count }: { label: string; seconds: number; max: number; color?: string; count: number }) {
  const w = max > 0 ? Math.max((seconds / max) * 100, 0.5) : 0
  return (
    <div className="group flex items-center gap-3 py-2">
      <span className="w-36 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">{label}</span>
      <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${w}%`, backgroundColor: color || '#000' }}
        />
      </div>
      <span className="w-24 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
        {formatDuration(seconds)} <span className="opacity-60">({formatNumCompact(count)})</span>
      </span>
    </div>
  )
}

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-text-primary text-2xl md:text-3xl mt-16 mb-6 scroll-mt-24">
      {children}
    </h2>
  )
}

function Divider() {
  return <div className="border-t border-border my-8" />
}

function TypeBadge({ type }: { type: string }) {
  const config = TRAILER_TYPE_CONFIG[type as TrailerType]
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-body font-semibold text-white"
      style={{ backgroundColor: config?.color || '#a4a4a4' }}
    >
      {config?.label || type}
    </span>
  )
}

/* ---------- Movie-specific analytics header ---------- */

function MovieAnalyticsHeader({ imdbId }: { imdbId: string }) {
  const { data: movie, isLoading } = useMovieDetail(imdbId)

  if (isLoading) {
    return (
      <div className="mb-12">
        <div className="skeleton h-8 w-64 rounded mb-4" />
        <div className="skeleton h-4 w-48 rounded" />
      </div>
    )
  }

  if (!movie) return null

  const langCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  for (const t of movie.trailers) {
    if (t.language) langCounts[t.language] = (langCounts[t.language] || 0) + 1
    typeCounts[t.type] = (typeCounts[t.type] || 0) + 1
  }

  const langEntries = Object.entries(langCounts).sort((a, b) => b[1] - a[1])
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
  const maxType = typeEntries.length > 0 ? typeEntries[0]![1] : 0

  return (
    <div className="mb-12 p-6 md:p-8 rounded-xl bg-bg-surface border border-border">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link
            to={`/movie/${movie.slug}`}
            className="font-display text-text-primary text-2xl md:text-3xl hover:opacity-70 transition-opacity"
          >
            {movie.title}
          </Link>
          <div className="flex items-center gap-2 mt-1 text-sm font-body text-text-muted">
            {movie.year && <span>{movie.year}</span>}
            {movie.imdb_rating && (
              <>
                <span>·</span>
                <span className={ratingColor(movie.imdb_rating)}>★ {movie.imdb_rating.toFixed(1)}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-text-primary text-3xl">{movie.trailers.length}</div>
          <div className="text-text-muted text-xs uppercase tracking-wider font-body">Trailers</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-text-muted font-body mb-2">
          Languages ({langEntries.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {langEntries.map(([lang, count]) => (
            <span
              key={lang}
              className="px-2.5 py-1 rounded-full bg-bg-base text-text-secondary text-xs font-body border border-border"
            >
              {LANGUAGE_FLAGS[lang] || ''} {LANGUAGE_NAMES[lang] || lang.toUpperCase()} ({count})
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-text-muted font-body mb-2">
          Types Breakdown
        </div>
        <div className="space-y-1">
          {typeEntries.map(([type, count]) => {
            const config = TRAILER_TYPE_CONFIG[type as TrailerType]
            return (
              <HBar
                key={type}
                label={config?.label || type}
                value={count}
                max={maxType}
                total={movie.trailers.length}
                color={config?.color || '#a4a4a4'}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Main Analytics page ---------- */

export function Analytics() {
  const [searchParams] = useSearchParams()
  const movieParam = searchParams.get('movie')

  const { data: stats, isLoading: statsLoading } = useSiteStats()
  const { data: indexData, isLoading: indexLoading } = useBrowseIndex()
  const { data: mostTrailers } = useBrowseShard('most-trailers.json')

  // Compute derived analytics from the full index
  const analytics = useMemo(() => {
    if (!indexData) return null
    const { movies } = indexData

    // By decade
    const byDecade: Record<string, { movies: number; trailers: number }> = {}
    // Rating bands
    const ratingBands: Record<string, { movies: number; trailers: number }> = {}

    for (const m of movies) {
      // Decade
      if (m.year) {
        const decade = `${Math.floor(m.year / 10) * 10}s`
        if (!byDecade[decade]) byDecade[decade] = { movies: 0, trailers: 0 }
        byDecade[decade]!.movies++
        byDecade[decade]!.trailers += m.trailer_count
      }

      // Rating bands
      if (m.rating != null && m.rating > 0) {
        const lower = Math.floor(m.rating * 2) / 2
        const bandKey = `${lower.toFixed(1)}-${(lower + 0.5).toFixed(1)}`
        if (!ratingBands[bandKey]) ratingBands[bandKey] = { movies: 0, trailers: 0 }
        ratingBands[bandKey]!.movies++
        ratingBands[bandKey]!.trailers += m.trailer_count
      }
    }

    const decades = Object.entries(byDecade)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .filter(([decade]) => parseInt(decade) >= 1950)

    const ratings = Object.entries(ratingBands)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .filter(([band]) => parseFloat(band) >= 3.0)

    const totalMovies = movies.length
    const avgTrailers = totalMovies > 0 ? movies.reduce((s, m) => s + m.trailer_count, 0) / totalMovies : 0

    return { decades, ratings, totalMovies, avgTrailers }
  }, [indexData])

  const loading = statsLoading || indexLoading

  // Compute total trailer count (movies + series)
  const totalAllTrailers = (stats?.total_trailers ?? 0) + (stats?.total_series_trailers ?? 0)

  // Jump link sections
  const jumpLinks = [
    ['#overview', 'Overview'],
    ['#engagement', 'YouTube'],
    ['#channels', 'Channels'],
    ['#duration', 'Duration'],
    ['#types', 'Types'],
    ['#languages', 'Languages'],
    ['#decades', 'Decades'],
    ['#top-movies', 'Top Movies'],
    ['#ratings', 'Ratings'],
    ['#series', 'Series'],
  ]

  return (
    <>
      <SEOHead
        title="Analytics"
        description="Explore analytics and statistics for The Trailer Database — 202 billion YouTube views, 300K+ trailers, engagement data, and more."
      />

      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <header className="mb-12">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl lg:text-6xl leading-tight">
            Analytics
          </h1>
          <p className="text-text-muted font-body text-lg mt-3 max-w-2xl">
            A data-driven look at the world's largest open-source trailer database.
          </p>

          {/* Jump links */}
          <nav className="flex flex-wrap gap-2 mt-6" aria-label="Analytics sections">
            {jumpLinks.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-3 py-1 rounded-full bg-bg-surface text-text-secondary text-xs font-body font-medium border border-border hover:border-border-hover hover:text-text-primary transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        {/* Movie-specific header */}
        {movieParam && <MovieAnalyticsHeader imdbId={movieParam} />}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* ================================================================
                1. OVERVIEW
            ================================================================ */}
            <SectionHeading id="overview">Overview</SectionHeading>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                value={stats ? formatNum(stats.movies_with_trailers) : '--'}
                label="Movies with Trailers"
              />
              <StatCard
                value={stats?.series_with_trailers ? formatNum(stats.series_with_trailers) : '--'}
                label="Series with Trailers"
              />
              <StatCard
                value={stats ? formatNum(totalAllTrailers) : '--'}
                label="Total Trailers"
                sublabel={stats ? `${formatNum(stats.total_trailers)} movie + ${formatNum(stats.total_series_trailers ?? 0)} series` : undefined}
              />
              <StatCard
                value={stats?.total_views ? formatNum(stats.total_views) : '--'}
                label="YouTube Views"
                sublabel="across all trailers"
              />
              <StatCard
                value={stats?.total_likes ? formatNum(stats.total_likes) : '--'}
                label="YouTube Likes"
              />
              <StatCard
                value={stats?.unique_channels ? formatNum(stats.unique_channels) : '--'}
                label="Unique Channels"
              />
            </div>

            <Divider />

            {/* ================================================================
                2. YOUTUBE ENGAGEMENT
            ================================================================ */}
            <SectionHeading id="engagement">YouTube Engagement</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              The most-watched trailers on YouTube, ranked by view count.
            </p>

            {/* Engagement callout */}
            {stats?.total_views && (
              <div className="px-6 py-5 rounded-xl bg-bg-surface border border-border mb-8">
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                  <span className="font-display text-text-primary text-2xl md:text-3xl">
                    {formatNum(stats.total_views)} views
                  </span>
                  <span className="text-text-muted font-body text-sm">
                    across {formatNum(totalAllTrailers)} trailers
                    {stats.total_likes ? ` with ${formatNum(stats.total_likes)} likes` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Most viewed trailers table */}
            {stats?.most_viewed && stats.most_viewed.length > 0 && (
              <>
                <h3 className="font-display text-text-primary text-xl mb-4">Most Viewed Trailers</h3>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full font-body text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-2 w-8 text-text-muted text-xs uppercase tracking-wider font-medium">#</th>
                        <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Trailer</th>
                        <th className="text-left py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium hidden md:table-cell">Type</th>
                        <th className="text-right py-3 pl-3 text-text-muted text-xs uppercase tracking-wider font-medium">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.most_viewed.map((trailer, i) => (
                        <tr key={trailer.youtube_id} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                          <td className="py-3 pr-2 text-text-muted tabular-nums align-top">{i + 1}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-start gap-3">
                              <a
                                href={`https://www.youtube.com/watch?v=${trailer.youtube_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 block w-24 md:w-32 aspect-video rounded overflow-hidden bg-bg-surface"
                              >
                                <img
                                  src={youtubeThumbnail(trailer.youtube_id, 'mq')}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </a>
                              <div className="min-w-0">
                                {trailer.imdb_id ? (
                                  <Link
                                    to={`/movie/${trailer.imdb_id}`}
                                    className="text-text-primary hover:text-text-secondary transition-colors font-medium block truncate"
                                  >
                                    {trailer.movie}
                                  </Link>
                                ) : (
                                  <span className="text-text-primary font-medium block truncate">{trailer.movie}</span>
                                )}
                                <span className="text-text-muted text-xs block mt-0.5 truncate">{trailer.title}</span>
                                <span className="md:hidden mt-1 block"><TypeBadge type={trailer.type} /></span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top hidden md:table-cell">
                            <TypeBadge type={trailer.type} />
                          </td>
                          <td className="py-3 pl-3 text-right align-top tabular-nums font-medium text-text-primary whitespace-nowrap">
                            {formatNum(trailer.views)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <Divider />

            {/* ================================================================
                3. TOP CHANNELS
            ================================================================ */}
            <SectionHeading id="channels">Top Channels</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              The studios and distributors uploading the most trailers to YouTube.
            </p>

            {stats?.top_channels && stats.top_channels.length > 0 && (() => {
              const channels = stats.top_channels!
              const top10 = channels.slice(0, 10)
              const maxTrailerCount = channels.length > 0 ? channels[0]!.trailers : 0

              return (
                <>
                  {/* Bar chart of top 10 */}
                  <div className="mb-8">
                    <div className="space-y-0.5">
                      {top10.map((ch) => (
                        <div key={ch.name} className="group flex items-center gap-3 py-2">
                          <span className="w-36 md:w-52 shrink-0 text-sm font-body text-text-secondary text-right truncate" title={ch.name}>
                            {ch.name}
                          </span>
                          <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
                            <div
                              className="h-full rounded-md transition-all duration-500 bg-text-primary/80"
                              style={{ width: `${maxTrailerCount > 0 ? Math.max((ch.trailers / maxTrailerCount) * 100, 0.5) : 0}%` }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                            {formatNum(ch.trailers)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Full table of top 20 */}
                  <h3 className="font-display text-text-primary text-xl mb-4">All Top Channels</h3>
                  <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full font-body text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 pr-2 w-8 text-text-muted text-xs uppercase tracking-wider font-medium">#</th>
                          <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Channel</th>
                          <th className="text-right py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Trailers</th>
                          <th className="text-right py-3 pl-3 text-text-muted text-xs uppercase tracking-wider font-medium">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channels.map((ch, i) => (
                          <tr key={ch.name} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                            <td className="py-3 pr-2 text-text-muted tabular-nums">{i + 1}</td>
                            <td className="py-3 pr-4 text-text-primary font-medium">{ch.name}</td>
                            <td className="py-3 px-3 text-right tabular-nums text-text-secondary">{formatNum(ch.trailers)}</td>
                            <td className="py-3 pl-3 text-right tabular-nums text-text-secondary">{formatNum(ch.views)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}

            <Divider />

            {/* ================================================================
                4. DURATION ANALYSIS
            ================================================================ */}
            <SectionHeading id="duration">Duration Analysis</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Average trailer duration by content type.
              {stats?.avg_duration_seconds && (
                <> Overall average: <strong className="text-text-primary">{formatDuration(stats.avg_duration_seconds)}</strong>.</>
              )}
            </p>

            {stats?.duration_by_type && (() => {
              const entries = Object.entries(stats.duration_by_type!)
                .map(([type, data]) => ({
                  type,
                  label: TRAILER_TYPE_CONFIG[type as TrailerType]?.label || type,
                  color: TRAILER_TYPE_CONFIG[type as TrailerType]?.color || '#a4a4a4',
                  avgSeconds: data.avg_seconds,
                  count: data.count,
                }))
                .sort((a, b) => b.avgSeconds - a.avgSeconds)
              const maxSeconds = entries.length > 0 ? entries[0]!.avgSeconds : 0

              return (
                <div className="space-y-0.5">
                  {entries.map((entry) => (
                    <DurationBar
                      key={entry.type}
                      label={entry.label}
                      seconds={entry.avgSeconds}
                      max={maxSeconds}
                      color={entry.color}
                      count={entry.count}
                    />
                  ))}
                </div>
              )
            })()}

            <Divider />

            {/* ================================================================
                5. TRAILER TYPE BREAKDOWN
            ================================================================ */}
            <SectionHeading id="types">Trailer Type Breakdown</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Distribution of {stats ? formatNum(stats.total_trailers) : ''} trailers across content types.
            </p>

            {stats && (() => {
              const entries = Object.entries(stats.by_type).sort((a, b) => b[1] - a[1])
              const maxVal = entries.length > 0 ? entries[0]![1] : 0
              return (
                <div className="space-y-0.5">
                  {entries.map(([type, count]) => {
                    const config = TRAILER_TYPE_CONFIG[type as TrailerType]
                    return (
                      <HBar
                        key={type}
                        label={config?.label || type}
                        value={count}
                        max={maxVal}
                        total={stats.total_trailers}
                        color={config?.color || '#a4a4a4'}
                      />
                    )
                  })}
                </div>
              )
            })()}

            <Divider />

            {/* ================================================================
                6. LANGUAGE COVERAGE
            ================================================================ */}
            <SectionHeading id="languages">Language Coverage</SectionHeading>

            {stats && (() => {
              const entries = Object.entries(stats.by_language).sort((a, b) => b[1] - a[1])
              const maxVal = entries.length > 0 ? entries[0]![1] : 0
              const englishCount = stats.by_language['en'] || 0
              const englishPct = pct(englishCount, stats.total_trailers)
              return (
                <>
                  <div className="px-5 py-4 rounded-xl bg-bg-surface border border-border mb-6">
                    <span className="font-display text-text-primary text-xl">{englishPct}</span>
                    <span className="text-text-muted font-body text-sm ml-2">of all trailers are in English</span>
                  </div>

                  <div className="space-y-0.5">
                    {entries.map(([lang, count]) => {
                      const flag = LANGUAGE_FLAGS[lang] || ''
                      const name = LANGUAGE_NAMES[lang] || lang.toUpperCase()
                      return (
                        <HBar
                          key={lang}
                          label={`${flag} ${name}`}
                          value={count}
                          max={maxVal}
                          total={stats.total_trailers}
                          color="#000"
                        />
                      )
                    })}
                  </div>
                </>
              )
            })()}

            <Divider />

            {/* ================================================================
                7. TRAILERS BY DECADE
            ================================================================ */}
            <SectionHeading id="decades">Trailers by Decade</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              How trailer coverage varies across movie eras.
            </p>

            {analytics && analytics.decades.length > 0 && (() => {
              const maxMovies = Math.max(...analytics.decades.map(d => d[1].movies))
              const maxTrailers = Math.max(...analytics.decades.map(d => d[1].trailers))
              return (
                <div className="overflow-x-auto">
                  <table className="w-full font-body text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Decade</th>
                        <th className="text-right py-3 px-4 text-text-muted text-xs uppercase tracking-wider font-medium">Movies</th>
                        <th className="py-3 px-4 text-text-muted text-xs uppercase tracking-wider font-medium text-left">Distribution</th>
                        <th className="text-right py-3 pl-4 text-text-muted text-xs uppercase tracking-wider font-medium">Trailers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.decades.map(([decade, data]) => (
                        <tr key={decade} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                          <td className="py-3 pr-4 font-display text-text-primary text-base">{decade}</td>
                          <td className="py-3 px-4 text-right text-text-secondary tabular-nums">{data.movies.toLocaleString()}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-4 bg-bg-surface rounded overflow-hidden">
                                <div
                                  className="h-full rounded bg-text-primary/80 transition-all duration-500"
                                  style={{ width: `${(data.movies / maxMovies) * 100}%` }}
                                />
                              </div>
                              <div className="flex-1 h-4 bg-bg-surface rounded overflow-hidden">
                                <div
                                  className="h-full rounded bg-text-muted/60 transition-all duration-500"
                                  style={{ width: `${(data.trailers / maxTrailers) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                              <span>Movies</span>
                              <span>Trailers</span>
                            </div>
                          </td>
                          <td className="py-3 pl-4 text-right text-text-secondary tabular-nums">{data.trailers.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <Divider />

            {/* ================================================================
                8. TOP MOVIES BY TRAILER COUNT
            ================================================================ */}
            <SectionHeading id="top-movies">Top Movies by Trailer Count</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              The 20 movies with the most trailers and videos in our database.
            </p>

            {mostTrailers && (() => {
              const top20 = mostTrailers.slice(0, 20)
              return (
                <div className="overflow-x-auto">
                  <table className="w-full font-body text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-2 w-8 text-text-muted text-xs uppercase tracking-wider font-medium">#</th>
                        <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Title</th>
                        <th className="text-center py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Year</th>
                        <th className="text-center py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Rating</th>
                        <th className="text-right py-3 pl-3 text-text-muted text-xs uppercase tracking-wider font-medium">Trailers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top20.map((movie: MovieIndex, i: number) => (
                        <tr key={movie.imdb_id} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                          <td className="py-3 pr-2 text-text-muted tabular-nums">{i + 1}</td>
                          <td className="py-3 pr-4">
                            <Link
                              to={`/movie/${movie.slug}`}
                              className="text-text-primary hover:text-text-secondary transition-colors font-medium"
                            >
                              {movie.title}
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-center text-text-secondary">{movie.year || '---'}</td>
                          <td className={`py-3 px-3 text-center font-semibold ${ratingColor(movie.rating)}`}>
                            {movie.rating ? `★ ${movie.rating.toFixed(1)}` : '---'}
                          </td>
                          <td className="py-3 pl-3 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-display text-text-primary text-lg leading-none">{movie.trailer_count}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <Divider />

            {/* ================================================================
                9. RATING VS TRAILER COUNT
            ================================================================ */}
            <SectionHeading id="ratings">Rating vs. Trailer Count</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Average number of trailers per movie, grouped by IMDb rating band.
            </p>

            {analytics && analytics.ratings.length > 0 && (() => {
              const data = analytics.ratings.map(([band, d]) => ({
                band,
                movies: d.movies,
                trailers: d.trailers,
                avg: d.movies > 0 ? d.trailers / d.movies : 0,
              }))
              const maxAvg = Math.max(...data.map(d => d.avg))

              return (
                <div className="space-y-2">
                  {data.map(({ band, movies, avg }) => (
                    <div key={band} className="flex items-center gap-3 py-1.5">
                      <span className="w-20 shrink-0 text-sm font-body text-text-secondary text-right tabular-nums">
                        ★ {band}
                      </span>
                      <div className="flex-1 h-6 bg-bg-surface rounded overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{
                            width: `${maxAvg > 0 ? (avg / maxAvg) * 100 : 0}%`,
                            backgroundColor: parseFloat(band) >= 7 ? 'var(--color-rating-green)' :
                              parseFloat(band) >= 5 ? 'var(--color-rating-gold)' : 'var(--color-rating-red)',
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                        {avg.toFixed(2)} avg
                        <span className="opacity-60 ml-1">({formatNum(movies)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}

            <Divider />

            {/* ================================================================
                10. SERIES STATS
            ================================================================ */}
            <SectionHeading id="series">Series Stats</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              TV series and shows in the database.
            </p>

            {stats && (stats.series_with_trailers || stats.total_series_trailers) && (() => {
              const seriesCount = stats.series_with_trailers ?? 0
              const seriesTrailers = stats.total_series_trailers ?? 0
              const avgPerSeries = seriesCount > 0 ? seriesTrailers / seriesCount : 0

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    value={formatNum(seriesCount)}
                    label="Series with Trailers"
                  />
                  <StatCard
                    value={formatNum(seriesTrailers)}
                    label="Series Trailers"
                  />
                  <StatCard
                    value={avgPerSeries.toFixed(1)}
                    label="Avg per Series"
                    sublabel="trailers per series"
                  />
                </div>
              )
            })()}

            {/* Footer note */}
            <div className="mt-16 pt-8 border-t border-border text-center">
              <p className="text-text-muted font-body text-sm">
                Data sourced from{' '}
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-text-primary hover:underline">
                  TMDB
                </a>{' '}
                and enriched with YouTube metadata.
              </p>
              <p className="text-text-muted font-body text-xs mt-1">
                Statistics are updated periodically as new trailers are discovered.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
