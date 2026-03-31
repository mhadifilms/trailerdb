import { useMemo } from 'react'
import type { AnalyticsData } from '../../lib/types'
import { DataTable, type Column } from '../../components/analytics/DataTable'
import { InsightCard } from '../../components/analytics/InsightCard'

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

interface Props {
  data: AnalyticsData
}

type ChannelRow = AnalyticsData['top_channels_by_views'][number]

function ChannelBars({ channels, metric, label }: { channels: ChannelRow[]; metric: 'views' | 'trailers'; label: string }) {
  const top10 = channels.slice(0, 10)
  const maxVal = top10.length > 0 ? top10[0]![metric] : 0

  return (
    <div className="mb-8">
      <h3 className="font-display text-text-primary text-xl mb-4">{label}</h3>
      <div className="space-y-0.5">
        {top10.map((ch, i) => {
          const val = ch[metric]
          const w = maxVal > 0 ? Math.max((val / maxVal) * 100, 0.5) : 0
          return (
            <div key={ch.name} className="group flex items-center gap-3 py-2">
              <span className="w-6 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                {i + 1}
              </span>
              <span className="w-36 md:w-52 shrink-0 text-sm font-body text-text-secondary text-right truncate" title={ch.name}>
                {ch.name}
              </span>
              <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500 bg-text-primary/80"
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                {formatNum(val)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChannelsTab({ data }: Props) {
  const { top_channels_by_views, top_channels_by_count } = data

  // Find most efficient channel (highest avg views per trailer, min 10 trailers)
  const efficient = useMemo(() => {
    const qualified = top_channels_by_views.filter(c => c.trailers >= 10)
    if (qualified.length === 0) return null
    return [...qualified].sort((a, b) => b.avg_per_trailer - a.avg_per_trailer)[0]!
  }, [top_channels_by_views])

  const viewsColumns: Column<ChannelRow>[] = [
    {
      header: '#',
      accessor: (_, ) => '',
      sortValue: (r) => r.views,
      align: 'left',
      className: 'w-8',
    },
    {
      header: 'Channel',
      accessor: (r) => <span className="font-medium text-text-primary">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    {
      header: 'Trailers',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.trailers)}</span>,
      sortValue: (r) => r.trailers,
      align: 'right',
    },
    {
      header: 'Total Views',
      accessor: (r) => <span className="tabular-nums font-medium text-text-primary">{formatNum(r.views)}</span>,
      sortValue: (r) => r.views,
      align: 'right',
    },
    {
      header: 'Avg / Trailer',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.avg_per_trailer)}</span>,
      sortValue: (r) => r.avg_per_trailer,
      align: 'right',
    },
  ]

  const countColumns: Column<ChannelRow>[] = [
    {
      header: '#',
      accessor: () => '',
      sortValue: (r) => r.trailers,
      align: 'left',
      className: 'w-8',
    },
    {
      header: 'Channel',
      accessor: (r) => <span className="font-medium text-text-primary">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    {
      header: 'Trailers',
      accessor: (r) => <span className="tabular-nums font-medium text-text-primary">{formatNum(r.trailers)}</span>,
      sortValue: (r) => r.trailers,
      align: 'right',
    },
    {
      header: 'Total Views',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.views)}</span>,
      sortValue: (r) => r.views,
      align: 'right',
    },
    {
      header: 'Avg / Trailer',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.avg_per_trailer)}</span>,
      sortValue: (r) => r.avg_per_trailer,
      align: 'right',
    },
  ]

  return (
    <div>
      {/* Efficiency callout */}
      {efficient && (
        <div className="mb-12">
          <InsightCard
            title="Highest Efficiency Channel"
            value={efficient.name}
            description={`With ${formatNum(efficient.trailers)} trailers averaging ${formatNum(efficient.avg_per_trailer)} views each, this channel gets the most value per upload.`}
            accent="var(--color-type-featurette)"
          />
        </div>
      )}

      {/* Top by views */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Top Channels by Views
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          Channels ranked by total cumulative YouTube views across all their trailers.
        </p>
        <ChannelBars channels={top_channels_by_views} metric="views" label="Total Views" />
        <DataTable columns={viewsColumns} data={top_channels_by_views} keyFn={(r) => r.name} />
      </section>

      {/* Top by count */}
      <section>
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Top Channels by Upload Count
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          The most prolific channels — ranked by how many trailers they have uploaded.
        </p>
        <ChannelBars channels={top_channels_by_count} metric="trailers" label="Trailer Count" />
        <DataTable columns={countColumns} data={top_channels_by_count} keyFn={(r) => r.name} />
      </section>
    </div>
  )
}
