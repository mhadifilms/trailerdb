import { useState, useMemo } from 'react'
import { useMovieDetail, useAnalytics } from '../../lib/api'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../../lib/constants'
import { posterUrl, youtubeThumbnail, formatDate } from '../../lib/utils'
import { DataTable, type Column } from '../../components/analytics/DataTable'
import { BarChart } from '../../components/analytics/BarChart'
import type { TrailerType, Trailer } from '../../lib/types'

/* ---------- helpers ---------- */

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%'
  return `${((numerator / denominator) * 100).toFixed(2)}%`
}

/* ---------- sub-tabs ---------- */

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trailers', label: 'Trailers' },
  { id: 'languages', label: 'Languages' },
] as const

type SubTabId = (typeof SUB_TABS)[number]['id']

/* ---------- TypeBadge ---------- */

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

/* ---------- HeroStat ---------- */

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-4">
      <div className="font-display text-text-primary text-2xl md:text-3xl leading-none">{value}</div>
      <div className="text-text-muted text-[10px] uppercase tracking-widest mt-1.5 font-body font-medium">
        {label}
      </div>
    </div>
  )
}

/* ---------- OverviewSubTab ---------- */

function OverviewSubTab({ trailers, movieGenres, analyticsData }: {
  trailers: Trailer[]
  movieGenres: string[]
  analyticsData: ReturnType<typeof useAnalytics>['data']
}) {
  const totalViews = trailers.reduce((s, t) => s + (t.views ?? 0), 0)
  const totalLikes = 0 // Likes not in Trailer type, approximate from engagement
  const uniqueLangs = new Set(trailers.map((t) => t.language).filter(Boolean)).size
  const engagementRate = totalViews > 0 ? pct(totalLikes, totalViews) : '0%'

  // Type breakdown
  const typeCounts: Record<string, number> = {}
  for (const t of trailers) {
    typeCounts[t.type] = (typeCounts[t.type] || 0) + 1
  }
  const typeItems = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      label: TRAILER_TYPE_CONFIG[type as TrailerType]?.label || type,
      value: count,
      color: TRAILER_TYPE_CONFIG[type as TrailerType]?.color || '#a4a4a4',
    }))

  // Genre average comparison
  const genreAvg = useMemo(() => {
    if (!analyticsData) return null
    // Find matching genre in type_by_genre
    const movieAvgViews = trailers.length > 0
      ? totalViews / trailers.length
      : 0
    // Use global avg as fallback
    const globalAvg = analyticsData.overview.avg_views_per_trailer
    return { movieAvg: movieAvgViews, globalAvg }
  }, [analyticsData, trailers, totalViews])

  // Marketing timeline
  const timeline = useMemo(() => {
    return trailers
      .filter((t) => t.published_at)
      .map((t) => ({
        title: t.title || 'Untitled',
        type: t.type,
        date: t.published_at!,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [trailers])

  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <div className="flex items-center justify-center gap-6 md:gap-10 py-6 rounded-xl bg-bg-surface border border-border flex-wrap">
        <HeroStat value={formatNum(totalViews)} label="Total Views" />
        <HeroStat value={String(trailers.length)} label="Trailers" />
        <HeroStat value={String(uniqueLangs)} label="Languages" />
        {genreAvg && (
          <HeroStat
            value={formatNum(Math.round(genreAvg.movieAvg))}
            label="Avg Views / Trailer"
          />
        )}
      </div>

      {/* vs Average */}
      {genreAvg && (
        <div className="rounded-xl border border-border p-6">
          <h3 className="font-display text-text-primary text-lg mb-3">vs Global Average</h3>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="text-xs font-body text-text-muted uppercase tracking-widest mb-1">This Movie</div>
              <div className="font-display text-text-primary text-xl">{formatNum(Math.round(genreAvg.movieAvg))}</div>
              <div className="text-xs font-body text-text-muted">avg views/trailer</div>
            </div>
            <div className="text-2xl text-text-muted font-display">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs font-body text-text-muted uppercase tracking-widest mb-1">Global Avg</div>
              <div className="font-display text-text-primary text-xl">{formatNum(Math.round(genreAvg.globalAvg))}</div>
              <div className="text-xs font-body text-text-muted">avg views/trailer</div>
            </div>
          </div>
          {genreAvg.movieAvg > 0 && genreAvg.globalAvg > 0 && (
            <div className="mt-3 text-sm font-body text-text-secondary">
              {genreAvg.movieAvg > genreAvg.globalAvg
                ? `This movie's trailers perform ${(genreAvg.movieAvg / genreAvg.globalAvg).toFixed(1)}x above the global average.`
                : `This movie's trailers are at ${((genreAvg.movieAvg / genreAvg.globalAvg) * 100).toFixed(0)}% of the global average.`}
            </div>
          )}
        </div>
      )}

      {/* Type breakdown */}
      {typeItems.length > 0 && (
        <div>
          <h3 className="font-display text-text-primary text-lg mb-3">Trailer Types</h3>
          <BarChart items={typeItems} formatValue={(v) => `${v}`} height={24} />
        </div>
      )}

      {/* Marketing timeline */}
      {timeline.length > 0 && (
        <div>
          <h3 className="font-display text-text-primary text-lg mb-3">Marketing Timeline</h3>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3 pl-8">
              {timeline.map((entry, i) => (
                <div key={i} className="relative">
                  {/* Dot */}
                  <div
                    className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-bg-base"
                    style={{
                      backgroundColor:
                        TRAILER_TYPE_CONFIG[entry.type as TrailerType]?.color || '#a4a4a4',
                    }}
                  />
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-body text-text-muted tabular-nums shrink-0">
                      {formatDate(entry.date)}
                    </span>
                    <TypeBadge type={entry.type} />
                    <span className="text-sm font-body text-text-primary truncate">
                      {entry.title}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- TrailersSubTab ---------- */

function TrailersSubTab({ trailers }: { trailers: Trailer[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const columns: Column<Trailer>[] = useMemo(
    () => [
      {
        header: 'Thumbnail',
        accessor: (row) => (
          <img
            src={youtubeThumbnail(row.youtube_id, 'mq')}
            alt=""
            className="w-20 h-12 object-cover rounded"
            loading="lazy"
          />
        ),
        className: 'w-24',
      },
      {
        header: 'Title',
        accessor: (row) => (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                setExpandedId((prev) =>
                  prev === row.youtube_id ? null : row.youtube_id,
                )
              }
              className="text-left font-medium text-text-primary hover:text-text-primary/70 transition-colors cursor-pointer truncate max-w-[180px]"
            >
              {row.title || 'Untitled'}
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${row.youtube_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
              title="Watch on YouTube"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        ),
        sortValue: (row) => row.title || '',
      },
      {
        header: 'Type',
        accessor: (row) => <TypeBadge type={row.type} />,
        sortValue: (row) => row.type,
      },
      {
        header: 'Lang',
        accessor: (row) => (
          <span className="text-xs">
            {row.language ? `${LANGUAGE_FLAGS[row.language] || ''} ${LANGUAGE_NAMES[row.language] || row.language}` : '--'}
          </span>
        ),
        sortValue: (row) => row.language || '',
      },
      {
        header: 'Views',
        accessor: (row) => formatNum(row.views ?? 0),
        sortValue: (row) => row.views ?? 0,
        align: 'right' as const,
      },
      {
        header: 'Duration',
        accessor: (row) => formatDuration(row.duration ?? null),
        sortValue: (row) => row.duration ?? 0,
        align: 'right' as const,
      },
      {
        header: 'Published',
        accessor: (row) => formatDate(row.published_at) || '--',
        sortValue: (row) => row.published_at || '',
        align: 'right' as const,
      },
      {
        header: 'Channel',
        accessor: (row) => (
          <span className="text-xs text-text-muted truncate max-w-[120px] block">
            {row.channel_name || '--'}
          </span>
        ),
        sortValue: (row) => row.channel_name || '',
      },
    ],
    [],
  )

  return (
    <div>
      <DataTable
        columns={columns}
        data={trailers}
        keyFn={(row) => row.youtube_id}
        pageSize={20}
      />

      {/* Expanded embed */}
      {expandedId && (
        <div className="mt-4 p-4 rounded-xl bg-bg-surface border border-border">
          <div className="aspect-video max-w-xl mx-auto rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${expandedId}`}
              title="Trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-4">
            <a
              href={`https://www.youtube.com/watch?v=${expandedId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-body text-text-secondary hover:text-text-primary transition-colors"
            >
              Watch on YouTube
            </a>
            <button
              onClick={() => setExpandedId(null)}
              className="text-sm font-body text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- LanguagesSubTab ---------- */

function LanguagesSubTab({ trailers }: { trailers: Trailer[] }) {
  // Aggregate views per language
  const langData = useMemo(() => {
    const langMap = new Map<string, { views: number; count: number }>()
    for (const t of trailers) {
      const lang = t.language || 'unknown'
      const entry = langMap.get(lang) || { views: 0, count: 0 }
      entry.views += t.views ?? 0
      entry.count++
      langMap.set(lang, entry)
    }
    return Array.from(langMap.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .map(([lang, data]) => ({
        label: `${LANGUAGE_FLAGS[lang] || ''} ${LANGUAGE_NAMES[lang] || lang}`,
        value: data.views,
        count: data.count,
        lang,
      }))
  }, [trailers])

  // Group trailers by group if available, otherwise by language
  const langGroups = useMemo(() => {
    const groups = new Map<string, Trailer[]>()
    for (const t of trailers) {
      const lang = t.language || 'unknown'
      const existing = groups.get(lang) || []
      existing.push(t)
      groups.set(lang, existing)
    }
    return Array.from(groups.entries())
      .sort((a, b) => {
        const aViews = a[1].reduce((s, t) => s + (t.views ?? 0), 0)
        const bViews = b[1].reduce((s, t) => s + (t.views ?? 0), 0)
        return bViews - aViews
      })
  }, [trailers])

  return (
    <div className="space-y-8">
      {/* Views per language bar chart */}
      <div>
        <h3 className="font-display text-text-primary text-lg mb-3">Views by Language</h3>
        <BarChart
          items={langData.map((d) => ({
            label: d.label,
            value: d.value,
          }))}
          formatValue={formatNum}
        />
      </div>

      {/* Language groups */}
      <div>
        <h3 className="font-display text-text-primary text-lg mb-3">Trailers by Language</h3>
        <div className="space-y-4">
          {langGroups.map(([lang, groupTrailers]) => (
            <div key={lang} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-body font-medium text-sm text-text-primary">
                  {LANGUAGE_FLAGS[lang] || ''} {LANGUAGE_NAMES[lang] || lang}
                </span>
                <span className="text-xs font-body text-text-muted">
                  {groupTrailers.length} trailer{groupTrailers.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs font-body text-text-muted tabular-nums ml-auto">
                  {formatNum(groupTrailers.reduce((s, t) => s + (t.views ?? 0), 0))} views
                </span>
              </div>
              <div className="space-y-1">
                {groupTrailers
                  .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
                  .map((t) => (
                    <div key={t.youtube_id} className="flex items-center gap-2 text-xs font-body">
                      <TypeBadge type={t.type} />
                      <span className="text-text-secondary truncate flex-1">
                        {t.title || 'Untitled'}
                      </span>
                      <span className="text-text-muted tabular-nums shrink-0">
                        {formatNum(t.views ?? 0)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- MovieDeepDive main ---------- */

export function MovieDeepDive({ imdbId }: { imdbId: string }) {
  const { data: movie, isLoading, error } = useMovieDetail(imdbId)
  const { data: analytics } = useAnalytics()
  const [subTab, setSubTab] = useState<SubTabId>('overview')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-40 rounded-xl" />
        <div className="skeleton h-60 rounded-xl" />
      </div>
    )
  }

  if (error || !movie) {
    return (
      <div className="text-center py-20">
        <h2 className="font-display text-text-primary text-2xl mb-3">Movie not found</h2>
        <p className="text-text-muted font-body">Could not load data for {imdbId}.</p>
      </div>
    )
  }

  const poster = posterUrl(movie.poster_path, 'w342')

  return (
    <div>
      {/* Movie header */}
      <div className="flex items-start gap-6 mb-8">
        {poster && (
          <img
            src={poster}
            alt={movie.title}
            className="w-24 md:w-32 rounded-lg shadow-lg shrink-0"
          />
        )}
        <div>
          <h2 className="font-display text-text-primary text-2xl md:text-3xl leading-tight">
            {movie.title}
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {movie.year && (
              <span className="text-sm font-body text-text-muted">{movie.year}</span>
            )}
            {movie.genres.map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 rounded-full bg-bg-surface border border-border text-xs font-body text-text-secondary"
              >
                {g}
              </span>
            ))}
            {movie.imdb_rating && (
              <span className="text-sm font-body font-medium text-text-primary">
                {movie.imdb_rating}/10
              </span>
            )}
          </div>
          {movie.overview && (
            <p className="text-sm font-body text-text-secondary mt-3 line-clamp-2 max-w-xl">
              {movie.overview}
            </p>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-border pb-3">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-body font-medium transition-all cursor-pointer ${
              subTab === tab.id
                ? 'bg-text-primary text-bg-base'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'overview' && (
        <OverviewSubTab
          trailers={movie.trailers}
          movieGenres={movie.genres}
          analyticsData={analytics}
        />
      )}
      {subTab === 'trailers' && <TrailersSubTab trailers={movie.trailers} />}
      {subTab === 'languages' && <LanguagesSubTab trailers={movie.trailers} />}
    </div>
  )
}
