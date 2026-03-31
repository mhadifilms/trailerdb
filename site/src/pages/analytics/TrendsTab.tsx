import { useMemo } from 'react'
import type { AnalyticsData } from '../../lib/types'

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

interface Props {
  data: AnalyticsData
}

/** CSS-only area chart */
function AreaChart({ data, label, formatVal }: {
  data: { label: string; value: number }[]
  label: string
  formatVal: (v: number) => string
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1)
  // Build polygon points for the area
  const width = 100
  const height = 100
  const step = data.length > 1 ? width / (data.length - 1) : width
  const points = data.map((d, i) => {
    const x = i * step
    const y = height - (d.value / maxVal) * height
    return `${x},${y}`
  })
  const areaPoints = [`0,${height}`, ...points, `${(data.length - 1) * step},${height}`].join(' ')
  const linePoints = points.join(' ')

  return (
    <div>
      <div className="relative" style={{ aspectRatio: '3/1' }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
          <polygon points={areaPoints} fill="rgba(0,0,0,0.06)" />
          <polyline points={linePoints} fill="none" stroke="#000" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const x = i * step
            const y = height - (d.value / maxVal) * height
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1.5"
                fill="#000"
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${d.label}: ${formatVal(d.value)}`}</title>
              </circle>
            )
          })}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute top-0 right-0 text-[10px] text-text-muted font-body tabular-nums -translate-y-3">
          {formatVal(maxVal)}
        </div>
        <div className="absolute bottom-0 right-0 text-[10px] text-text-muted font-body tabular-nums translate-y-3">
          0
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 px-0">
        {data.filter((_, i) => {
          // Show every 5th label on small sets, every label if < 10
          if (data.length <= 10) return true
          if (i === 0 || i === data.length - 1) return true
          return i % 5 === 0
        }).map((d) => (
          <span key={d.label} className="text-[10px] text-text-muted font-body tabular-nums">
            {d.label}
          </span>
        ))}
      </div>

      <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mt-3">
        {label}
      </div>
    </div>
  )
}

/** CSS-only bar chart */
function BarChart({ data, label, formatVal, color = '#000' }: {
  data: { label: string; value: number }[]
  label: string
  formatVal: (v: number) => string
  color?: string
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      <div className="flex items-end gap-[1px] md:gap-[2px]" style={{ height: 200 }}>
        {data.map((d, i) => {
          const h = maxVal > 0 ? Math.max((d.value / maxVal) * 100, 0.5) : 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                className="w-full rounded-t-sm transition-all duration-300"
                style={{ height: `${h}%`, backgroundColor: color, opacity: 0.75 }}
              />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className="bg-text-primary text-bg-base text-[10px] font-body px-2 py-1 rounded whitespace-nowrap">
                  {d.label}: {formatVal(d.value)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2">
        {data.filter((_, i) => {
          if (data.length <= 10) return true
          if (i === 0 || i === data.length - 1) return true
          return i % 5 === 0
        }).map((d) => (
          <span key={d.label} className="text-[10px] text-text-muted font-body tabular-nums">
            {d.label}
          </span>
        ))}
      </div>

      <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mt-3">
        {label}
      </div>
    </div>
  )
}

export function TrendsTab({ data }: Props) {
  const { by_year } = data

  // Filter to years 2000+ for cleaner charts
  const recentYears = useMemo(() => {
    return by_year.filter(y => y.year >= 2000).sort((a, b) => a.year - b.year)
  }, [by_year])

  const viewsData = recentYears.map(y => ({ label: String(y.year), value: y.total_views }))
  const avgViewsData = recentYears.map(y => ({ label: String(y.year), value: y.avg_views }))
  const trailersData = recentYears.map(y => ({ label: String(y.year), value: y.trailers }))
  const moviesData = recentYears.map(y => ({ label: String(y.year), value: y.movies }))

  // Key stats
  const peakViewsYear = recentYears.length > 0
    ? recentYears.reduce((max, y) => y.total_views > max.total_views ? y : max, recentYears[0]!)
    : null
  const peakTrailersYear = recentYears.length > 0
    ? recentYears.reduce((max, y) => y.trailers > max.trailers ? y : max, recentYears[0]!)
    : null

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {peakViewsYear && (
          <div className="p-6 rounded-xl bg-bg-surface border border-border">
            <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mb-2">
              Peak Views Year
            </div>
            <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">
              {peakViewsYear.year}
            </div>
            <div className="text-text-secondary text-sm font-body mt-1">
              {formatNum(peakViewsYear.total_views)} total views
            </div>
          </div>
        )}
        {peakTrailersYear && (
          <div className="p-6 rounded-xl bg-bg-surface border border-border">
            <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mb-2">
              Most Trailers Year
            </div>
            <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">
              {peakTrailersYear.year}
            </div>
            <div className="text-text-secondary text-sm font-body mt-1">
              {formatNum(peakTrailersYear.trailers)} trailers uploaded
            </div>
          </div>
        )}
      </div>

      {/* Total views by year */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Total Views by Year
        </h2>
        <p className="text-text-muted font-body text-sm mb-8">
          Cumulative YouTube views for all trailers associated with movies from each year.
        </p>
        <AreaChart data={viewsData} label="Total Views" formatVal={formatNum} />
      </section>

      {/* Average views per trailer by year */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Average Views per Trailer
        </h2>
        <p className="text-text-muted font-body text-sm mb-8">
          How much attention the average trailer gets, broken down by movie release year.
        </p>
        <AreaChart data={avgViewsData} label="Avg Views per Trailer" formatVal={formatNum} />
      </section>

      {/* Trailers per year */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Trailers per Year
        </h2>
        <p className="text-text-muted font-body text-sm mb-8">
          Number of trailers in the database for movies released each year.
        </p>
        <BarChart data={trailersData} label="Trailer Count" formatVal={formatNum} />
      </section>

      {/* Movies per year */}
      <section>
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Movies per Year
        </h2>
        <p className="text-text-muted font-body text-sm mb-8">
          Number of movies with trailers in the database, by release year.
        </p>
        <BarChart data={moviesData} label="Movie Count" formatVal={formatNum} color="var(--color-type-teaser)" />
      </section>
    </div>
  )
}
