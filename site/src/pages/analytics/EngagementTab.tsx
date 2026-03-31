import { Link } from 'react-router-dom'
import type { AnalyticsData, TrailerType } from '../../lib/types'
import { TRAILER_TYPE_CONFIG } from '../../lib/constants'
import { youtubeThumbnail } from '../../lib/utils'
import { DataTable, type Column } from '../../components/analytics/DataTable'

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TypeBadge({ type }: { type: string }) {
  const config = TRAILER_TYPE_CONFIG[type as TrailerType]
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-body font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: config?.color || '#a4a4a4' }}
    >
      {config?.label || type}
    </span>
  )
}

interface Props {
  data: AnalyticsData
}

export function EngagementTab({ data }: Props) {
  const { by_type, most_viewed, overperformers } = data

  // Engagement scorecard columns
  type TypeRow = AnalyticsData['by_type'][number]
  const scorecardColumns: Column<TypeRow>[] = [
    {
      header: 'Type',
      accessor: (r) => <TypeBadge type={r.type} />,
      sortValue: (r) => r.type,
    },
    {
      header: 'Count',
      accessor: (r) => formatNum(r.count),
      sortValue: (r) => r.count,
      align: 'right',
    },
    {
      header: 'Avg Views',
      accessor: (r) => formatNum(r.avg_views),
      sortValue: (r) => r.avg_views,
      align: 'right',
    },
    {
      header: 'Avg Likes',
      accessor: (r) => formatNum(r.avg_likes),
      sortValue: (r) => r.avg_likes,
      align: 'right',
    },
    {
      header: 'Likes / 1K',
      accessor: (r) => r.likes_per_1k_views.toFixed(1),
      sortValue: (r) => r.likes_per_1k_views,
      align: 'right',
    },
    {
      header: 'Views / Sec',
      accessor: (r) => formatNum(Math.round(r.views_per_second)),
      sortValue: (r) => r.views_per_second,
      align: 'right',
    },
    {
      header: 'Avg Duration',
      accessor: (r) => formatDuration(r.avg_duration),
      sortValue: (r) => r.avg_duration,
      align: 'right',
    },
  ]

  // Most viewed table columns
  type ViewedRow = AnalyticsData['most_viewed'][number]
  const viewedColumns: Column<ViewedRow>[] = [
    {
      header: '#',
      accessor: (_r, ) => '',
      sortValue: (r) => r.views,
      align: 'left',
      className: 'w-8',
    },
    {
      header: 'Trailer',
      accessor: (r) => (
        <div className="flex items-start gap-3">
          <a
            href={`https://www.youtube.com/watch?v=${r.youtube_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 block w-24 md:w-32 aspect-video rounded overflow-hidden bg-bg-surface"
          >
            <img
              src={youtubeThumbnail(r.youtube_id, 'mq')}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </a>
          <div className="min-w-0">
            <Link
              to={`/movie/${r.imdb_id}`}
              className="text-text-primary hover:text-text-secondary transition-colors font-medium block truncate"
            >
              {r.movie}
            </Link>
            <span className="text-text-muted text-xs block mt-0.5 truncate">{r.title}</span>
            <span className="mt-1 block"><TypeBadge type={r.type} /></span>
          </div>
        </div>
      ),
      sortValue: (r) => r.movie,
    },
    {
      header: 'Views',
      accessor: (r) => (
        <span className="tabular-nums font-medium text-text-primary">{formatNum(r.views)}</span>
      ),
      sortValue: (r) => r.views,
      align: 'right',
    },
    {
      header: 'Likes',
      accessor: (r) => (
        <span className="tabular-nums text-text-secondary">{formatNum(r.likes)}</span>
      ),
      sortValue: (r) => r.likes,
      align: 'right',
    },
  ]

  // Filter overperformers to 10x+
  const topOverperformers = overperformers.filter(o => o.multiplier >= 10).slice(0, 12)

  return (
    <div>
      {/* Engagement scorecard */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Engagement by Type
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          How each trailer type performs across key engagement metrics.
        </p>
        <DataTable columns={scorecardColumns} data={by_type} keyFn={(r) => r.type} />
      </section>

      {/* Most viewed trailers */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Most Viewed Trailers
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          The highest view-count trailers across all movies in the database.
        </p>
        <DataTable
          columns={viewedColumns}
          data={most_viewed}
          keyFn={(r) => r.youtube_id}
        />
      </section>

      {/* Overperformers */}
      {topOverperformers.length > 0 && (
        <section>
          <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
            Overperformers
          </h2>
          <p className="text-text-muted font-body text-sm mb-6">
            Trailers that massively outperformed their type average — at least 10x the norm.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topOverperformers.map((op) => {
              const config = TRAILER_TYPE_CONFIG[op.type as TrailerType]
              return (
                <div
                  key={op.youtube_id}
                  className="rounded-xl border border-border bg-bg-base p-5 hover:border-border-hover transition-colors"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <a
                      href={`https://www.youtube.com/watch?v=${op.youtube_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 block w-28 aspect-video rounded overflow-hidden bg-bg-surface"
                    >
                      <img
                        src={youtubeThumbnail(op.youtube_id, 'mq')}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </a>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/movie/${op.imdb_id}`}
                        className="text-text-primary hover:text-text-secondary transition-colors font-medium text-sm block truncate"
                      >
                        {op.movie}
                      </Link>
                      <div className="mt-1">
                        <TypeBadge type={op.type} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-display text-text-primary text-2xl">{Math.round(op.multiplier)}x</span>
                      <span className="text-text-muted text-xs font-body ml-1">above avg</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-body text-text-primary tabular-nums font-medium">{formatNum(op.views)}</div>
                      <div className="text-[10px] font-body text-text-muted">
                        vs {formatNum(op.type_avg)} avg for {config?.label || op.type}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
