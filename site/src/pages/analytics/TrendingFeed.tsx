import { useState, useMemo } from 'react'
import { useTrending, useAnalytics } from '../../lib/api'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../../lib/constants'
import { formatVotes } from '../../lib/utils'
import { TrendingCard } from '../../components/analytics/TrendingCard'
import { InsightCard } from '../../components/analytics/InsightCard'
import { MiniSparkline } from '../../components/analytics/MiniSparkline'
import type { TrailerType, AnalyticsData } from '../../lib/types'

/* ---------- helpers ---------- */

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

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/* ---------- time filters ---------- */

type TimeFilter = 'week' | 'month' | 'year' | 'all'
const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
]

function getMaxDays(filter: TimeFilter): number {
  switch (filter) {
    case 'week': return 7
    case 'month': return 30
    case 'year': return 365
    case 'all': return Infinity
  }
}

/* ---------- StatCard ---------- */

function StatCard({
  value,
  label,
  sparkData,
  sparkColor,
}: {
  value: string
  label: string
  sparkData?: number[]
  sparkColor?: string
}) {
  return (
    <div className="p-4 rounded-xl bg-bg-surface border border-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-text-primary text-2xl leading-none">{value}</div>
          <div className="text-text-muted text-[10px] uppercase tracking-widest mt-1.5 font-body font-medium">
            {label}
          </div>
        </div>
        {sparkData && sparkData.length >= 2 && (
          <MiniSparkline data={sparkData} color={sparkColor || '#000'} width={60} height={24} />
        )}
      </div>
    </div>
  )
}

/* ---------- LeaderboardEntry ---------- */

function LeaderboardEntry({
  rank,
  title,
  value,
  maxValue,
}: {
  rank: number
  title: string
  value: number
  maxValue: number
}) {
  const w = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-5 shrink-0 text-right text-[10px] font-body font-semibold text-text-muted tabular-nums">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-body text-text-primary font-medium truncate">{title}</div>
        <div className="h-1.5 bg-bg-base rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-text-primary/60"
            style={{ width: `${w}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-body text-text-muted tabular-nums">
        {formatNum(value)}
      </span>
    </div>
  )
}

/* ---------- auto-generated insights ---------- */

function generateInsights(analytics: AnalyticsData) {
  const insights: { title: string; value: string; description: string; accent: string }[] = []

  // 1. Top language by avg views vs English
  const english = analytics.by_language.find((l) => l.lang === 'en')
  const sortedLangs = [...analytics.by_language].sort((a, b) => b.avg_views - a.avg_views)
  const topLang = sortedLangs[0]
  if (topLang && english && topLang.lang !== 'en') {
    const mult = (topLang.avg_views / english.avg_views).toFixed(1)
    insights.push({
      title: 'Highest Avg Views Language',
      value: `${LANGUAGE_FLAGS[topLang.lang] || ''} ${LANGUAGE_NAMES[topLang.lang] || topLang.lang}`,
      description: `Averages ${formatNum(topLang.avg_views)} views per trailer, ${mult}x more than English.`,
      accent: 'var(--color-type-trailer)',
    })
  }

  // 2. Top performing type (exclude clips — they include music videos which skew data)
  const sortedTypes = [...analytics.by_type]
    .filter((t) => t.type !== 'clip')
    .sort((a, b) => b.avg_views - a.avg_views)
  const topType = sortedTypes[0]
  const trailerType = analytics.by_type.find((t) => t.type === 'trailer')
  if (topType && trailerType) {
    const config = TRAILER_TYPE_CONFIG[topType.type as TrailerType]
    const mult = (topType.avg_views / trailerType.avg_views).toFixed(1)
    insights.push({
      title: 'Top Performing Type',
      value: config?.label || topType.type,
      description: `Averages ${formatNum(topType.avg_views)} views per upload — ${mult}x more than standard trailers.`,
      accent: config?.color || '#000',
    })
  }

  // 3. Top channel
  if (analytics.top_channels_by_views.length > 0) {
    const topCh = analytics.top_channels_by_views[0]!
    insights.push({
      title: 'Top Channel by Views',
      value: topCh.name,
      description: `${formatNum(topCh.views)} total views across ${formatNum(topCh.trailers)} trailer uploads.`,
      accent: 'var(--color-type-featurette)',
    })
  }

  // 4. Multilingual stat
  if (analytics.multilingual_stats) {
    insights.push({
      title: 'Multilingual Movies',
      value: formatNum(analytics.multilingual_stats.movies_with_multiple_langs),
      description: `Movies with trailers in multiple languages, averaging ${analytics.multilingual_stats.avg_langs.toFixed(1)} languages per movie.`,
      accent: 'var(--color-type-teaser)',
    })
  }

  return insights.slice(0, 4)
}

/* ---------- TrendingFeed component ---------- */

export function TrendingFeed() {
  const { data: trending, isLoading: trendingLoading } = useTrending()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics()
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')

  const filteredTrending = useMemo(() => {
    if (!trending) return []
    const maxDays = getMaxDays(timeFilter)
    return trending
      .filter((t) => t.days_old <= maxDays)
      .sort((a, b) => b.velocity - a.velocity)
  }, [trending, timeFilter])

  const isLoading = trendingLoading || analyticsLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  // Build sparkline data from by_year
  const yearData = analytics?.by_year
    .filter((y) => y.year >= 2010)
    .sort((a, b) => a.year - b.year)
    .map((y) => y.trailers) ?? []

  const viewsYearData = analytics?.by_year
    .filter((y) => y.year >= 2010)
    .sort((a, b) => a.year - b.year)
    .map((y) => y.total_views) ?? []

  const insights = analytics ? generateInsights(analytics) : []

  // Filter out clips from most viewed (they're music videos, not trailers)
  const mostViewed = analytics?.most_viewed
    .filter((mv) => mv.type !== 'clip')
    .slice(0, 5) ?? []
  const topViewedMax = mostViewed.length > 0 ? mostViewed[0]!.views : 1

  return (
    <div>
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left: Trending feed (2/3) */}
      <div className="flex-1 lg:w-2/3 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-text-primary text-xl md:text-2xl">Trending</h2>
          <div className="flex gap-1">
            {TIME_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTimeFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-body font-medium transition-all cursor-pointer ${
                  timeFilter === f.id
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-surface'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTrending.length > 0 ? (
          <div className="space-y-2">
            {filteredTrending.slice(0, 30).map((t) => (
              <TrendingCard key={t.youtube_id} trailer={t} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-text-muted font-body text-sm">
              No trending trailers found for this time period.
            </div>
            <button
              onClick={() => setTimeFilter('all')}
              className="mt-2 text-sm font-body font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
            >
              Show all time
            </button>
          </div>
        )}
      </div>

      {/* Right sidebar (1/3) */}
      <div className="lg:w-1/3 shrink-0 space-y-6">
        {/* Quick stats */}
        {analytics && (
          <>
            <div>
              <h3 className="font-display text-text-primary text-lg mb-3">Quick Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  value={formatNum(analytics.overview.total_views)}
                  label="Total Views"
                  sparkData={viewsYearData}
                />
                <StatCard
                  value={formatNum(analytics.overview.trailers + analytics.overview.series_trailers)}
                  label="Total Trailers"
                  sparkData={yearData}
                />
                <StatCard
                  value={formatNum(analytics.overview.movies)}
                  label="Movies"
                />
                <StatCard
                  value={pct(analytics.overview.engagement_rate)}
                  label="Engagement"
                />
                <StatCard
                  value={String(analytics.by_language.length)}
                  label="Languages"
                />
                <StatCard
                  value={formatDuration(analytics.overview.avg_duration)}
                  label="Avg Duration"
                />
              </div>
            </div>

            {/* Most viewed leaderboard */}
            <div>
              <h3 className="font-display text-text-primary text-lg mb-3">Most Viewed</h3>
              <div className="rounded-xl bg-bg-surface border border-border p-3">
                {mostViewed.map((mv, i) => (
                  <a
                    key={mv.youtube_id}
                    href={`/analytics?movie=${mv.imdb_id}`}
                    className="block hover:bg-bg-hover rounded-lg transition-colors -mx-1 px-1"
                  >
                    <LeaderboardEntry
                      rank={i + 1}
                      title={`${mv.movie} - ${mv.title}`}
                      value={mv.views}
                      maxValue={topViewedMax}
                    />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      </div>

      {/* Bottom: Insights (full width below the 2-col layout) */}
      {insights.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-text-primary text-lg mb-3">Key Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.map((insight, i) => (
              <InsightCard key={i} {...insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
