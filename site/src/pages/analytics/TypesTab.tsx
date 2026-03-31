import { useMemo } from 'react'
import type { AnalyticsData, TrailerType } from '../../lib/types'
import { TRAILER_TYPE_CONFIG } from '../../lib/constants'
import { DataTable, type Column } from '../../components/analytics/DataTable'
import { HeatmapGrid } from '../../components/analytics/HeatmapGrid'

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

export function TypesTab({ data }: Props) {
  const { by_type, duration_heatmap, type_by_genre } = data

  // Full type comparison table
  type TypeRow = AnalyticsData['by_type'][number]
  const typeColumns: Column<TypeRow>[] = [
    {
      header: 'Type',
      accessor: (r) => <TypeBadge type={r.type} />,
      sortValue: (r) => r.type,
    },
    {
      header: 'Count',
      accessor: (r) => <span className="tabular-nums font-medium text-text-primary">{formatNum(r.count)}</span>,
      sortValue: (r) => r.count,
      align: 'right',
    },
    {
      header: 'Total Views',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.total_views)}</span>,
      sortValue: (r) => r.total_views,
      align: 'right',
    },
    {
      header: 'Avg Views',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.avg_views)}</span>,
      sortValue: (r) => r.avg_views,
      align: 'right',
    },
    {
      header: 'Max Views',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.max_views)}</span>,
      sortValue: (r) => r.max_views,
      align: 'right',
    },
    {
      header: 'Total Likes',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.total_likes)}</span>,
      sortValue: (r) => r.total_likes,
      align: 'right',
    },
    {
      header: 'Avg Duration',
      accessor: (r) => <span className="tabular-nums">{formatDuration(r.avg_duration)}</span>,
      sortValue: (r) => r.avg_duration,
      align: 'right',
    },
    {
      header: 'Likes / 1K',
      accessor: (r) => <span className="tabular-nums">{r.likes_per_1k_views.toFixed(1)}</span>,
      sortValue: (r) => r.likes_per_1k_views,
      align: 'right',
    },
  ]

  // Build heatmap data from duration_heatmap
  const heatmapData = useMemo(() => {
    const types = [...new Set(duration_heatmap.map(d => d.type))]
    const buckets = [...new Set(duration_heatmap.map(d => d.bucket))]
    // Sort buckets by the leading number
    buckets.sort((a, b) => {
      const na = parseInt(a.replace(/[^0-9]/g, ''))
      const nb = parseInt(b.replace(/[^0-9]/g, ''))
      return na - nb
    })

    const lookup: Record<string, number> = {}
    for (const d of duration_heatmap) {
      lookup[`${d.type}|${d.bucket}`] = d.avg_views
    }

    const grid: (number | null)[][] = types.map(t =>
      buckets.map(b => lookup[`${t}|${b}`] ?? null)
    )

    const rowLabels = types.map(t => {
      const config = TRAILER_TYPE_CONFIG[t as TrailerType]
      return config?.label || t
    })

    return { rowLabels, colLabels: buckets, grid }
  }, [duration_heatmap])

  // Build genre-type table
  const genreTypeKeys = useMemo(() => {
    if (type_by_genre.length === 0) return []
    const allKeys = new Set<string>()
    for (const row of type_by_genre) {
      for (const key of Object.keys(row)) {
        if (key !== 'genre') allKeys.add(key)
      }
    }
    return Array.from(allKeys)
  }, [type_by_genre])

  type GenreRow = AnalyticsData['type_by_genre'][number]
  const genreColumns: Column<GenreRow>[] = [
    {
      header: 'Genre',
      accessor: (r) => <span className="font-medium text-text-primary">{r.genre}</span>,
      sortValue: (r) => String(r.genre),
    },
    ...genreTypeKeys.map((key): Column<GenreRow> => {
      const config = TRAILER_TYPE_CONFIG[key as TrailerType]
      return {
        header: config?.label || key,
        accessor: (r) => {
          const v = r[key]
          return <span className="tabular-nums">{typeof v === 'number' ? formatNum(v) : String(v ?? '-')}</span>
        },
        sortValue: (r) => {
          const v = r[key]
          return typeof v === 'number' ? v : 0
        },
        align: 'right',
      }
    }),
  ]

  // Color scale for heatmap
  function heatmapColor(value: number, max: number): string {
    if (max === 0) return '#f8f8f8'
    const ratio = Math.min(value / max, 1)
    // Gradient from light to dark
    const r = Math.round(248 - ratio * 228)
    const g = Math.round(248 - ratio * 228)
    const b = Math.round(248 - ratio * 198)
    return `rgb(${r}, ${g}, ${b})`
  }

  return (
    <div>
      {/* Type comparison matrix */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Full Type Comparison
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          Every engagement metric broken down by trailer type.
        </p>

        {/* Visual type bars */}
        <div className="mb-8">
          {by_type.map((t) => {
            const config = TRAILER_TYPE_CONFIG[t.type as TrailerType]
            const maxCount = Math.max(...by_type.map(x => x.count))
            const w = maxCount > 0 ? Math.max((t.count / maxCount) * 100, 0.5) : 0
            return (
              <div key={t.type} className="flex items-center gap-3 py-2">
                <span className="w-32 md:w-40 shrink-0 text-right">
                  <TypeBadge type={t.type} />
                </span>
                <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all duration-500"
                    style={{ width: `${w}%`, backgroundColor: config?.color || '#a4a4a4' }}
                  />
                </div>
                <span className="w-20 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                  {formatNum(t.count)}
                </span>
              </div>
            )
          })}
        </div>

        <DataTable columns={typeColumns} data={by_type} keyFn={(r) => r.type} />
      </section>

      {/* Duration heatmap */}
      {heatmapData.rowLabels.length > 0 && heatmapData.colLabels.length > 0 && (
        <section className="mb-16">
          <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
            Duration vs. Views Heatmap
          </h2>
          <p className="text-text-muted font-body text-sm mb-6">
            Average views by trailer type and duration bucket. Darker cells indicate higher average views.
          </p>
          <HeatmapGrid
            rows={heatmapData.rowLabels}
            cols={heatmapData.colLabels}
            data={heatmapData.grid}
            colorScale={heatmapColor}
            formatValue={(v) => formatNum(v)}
          />
        </section>
      )}

      {/* Genre-type distribution */}
      {type_by_genre.length > 0 && (
        <section>
          <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
            Type Distribution by Genre
          </h2>
          <p className="text-text-muted font-body text-sm mb-6">
            How trailer types are distributed across movie genres.
          </p>
          <DataTable columns={genreColumns} data={type_by_genre} keyFn={(r) => String(r.genre)} />
        </section>
      )}
    </div>
  )
}
