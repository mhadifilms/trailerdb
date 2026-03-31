import { useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAnalytics } from '../lib/api'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { SEOHead } from '../components/SEOHead'
import { InsightCard } from '../components/analytics/InsightCard'
import type { TrailerType, AnalyticsData } from '../lib/types'

// Lazy-loaded tab components
const EngagementTab = lazy(() => import('./analytics/EngagementTab').then(m => ({ default: m.EngagementTab })))
const ChannelsTab = lazy(() => import('./analytics/ChannelsTab').then(m => ({ default: m.ChannelsTab })))
const LanguagesTab = lazy(() => import('./analytics/LanguagesTab').then(m => ({ default: m.LanguagesTab })))
const TrendsTab = lazy(() => import('./analytics/TrendsTab').then(m => ({ default: m.TrendsTab })))
const TypesTab = lazy(() => import('./analytics/TypesTab').then(m => ({ default: m.TypesTab })))

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

/* ---------- sub-components ---------- */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'channels', label: 'Channels' },
  { id: 'languages', label: 'Languages' },
  { id: 'trends', label: 'Trends' },
  { id: 'types', label: 'Types' },
] as const

type TabId = (typeof TABS)[number]['id']

function StatCard({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
  return (
    <div className="p-6 rounded-xl bg-bg-surface border border-border">
      <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">{value}</div>
      <div className="text-text-muted text-xs uppercase tracking-widest mt-2 font-body">{label}</div>
      {sublabel && <div className="text-text-muted text-xs mt-1 font-body">{sublabel}</div>}
    </div>
  )
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

function TabLoading() {
  return (
    <div className="space-y-4 py-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-xl" />
      ))}
    </div>
  )
}

/* ---------- Mini previews for Overview tab ---------- */

function MiniPreviewSection({ title, tabId, onNavigate, children }: {
  title: string
  tabId: TabId
  onNavigate: (tab: TabId) => void
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display text-text-primary text-xl md:text-2xl">{title}</h3>
        <button
          onClick={() => onNavigate(tabId)}
          className="text-text-muted hover:text-text-primary text-sm font-body font-medium transition-colors cursor-pointer"
        >
          See more &rarr;
        </button>
      </div>
      {children}
    </section>
  )
}

function MiniEngagement({ data }: { data: AnalyticsData }) {
  const top5 = data.most_viewed.slice(0, 5)
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Movie</th>
            <th className="text-left py-2 px-3 text-text-muted text-xs uppercase tracking-wider font-medium hidden sm:table-cell">Type</th>
            <th className="text-right py-2 pl-3 text-text-muted text-xs uppercase tracking-wider font-medium">Views</th>
          </tr>
        </thead>
        <tbody>
          {top5.map((t) => (
            <tr key={t.youtube_id} className="border-b border-border/50">
              <td className="py-2 pr-4 text-text-primary font-medium truncate max-w-[200px]">{t.movie}</td>
              <td className="py-2 px-3 hidden sm:table-cell"><TypeBadge type={t.type} /></td>
              <td className="py-2 pl-3 text-right tabular-nums text-text-secondary">{formatNum(t.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniChannels({ data }: { data: AnalyticsData }) {
  const top5 = data.top_channels_by_views.slice(0, 5)
  const maxViews = top5.length > 0 ? top5[0]!.views : 0
  return (
    <div className="space-y-0.5">
      {top5.map((ch) => {
        const w = maxViews > 0 ? Math.max((ch.views / maxViews) * 100, 0.5) : 0
        return (
          <div key={ch.name} className="flex items-center gap-3 py-1.5">
            <span className="w-32 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">
              {ch.name}
            </span>
            <div className="flex-1 h-6 bg-bg-surface rounded-md overflow-hidden">
              <div
                className="h-full rounded-md bg-text-primary/80"
                style={{ width: `${w}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
              {formatNum(ch.views)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MiniLanguages({ data }: { data: AnalyticsData }) {
  const sorted = [...data.by_language].sort((a, b) => b.avg_views - a.avg_views).slice(0, 5)
  const maxAvg = sorted.length > 0 ? sorted[0]!.avg_views : 0
  return (
    <div className="space-y-0.5">
      {sorted.map((l) => {
        const w = maxAvg > 0 ? Math.max((l.avg_views / maxAvg) * 100, 0.5) : 0
        return (
          <div key={l.lang} className="flex items-center gap-3 py-1.5">
            <span className="w-32 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">
              {LANGUAGE_FLAGS[l.lang] || ''} {LANGUAGE_NAMES[l.lang] || l.lang.toUpperCase()}
            </span>
            <div className="flex-1 h-6 bg-bg-surface rounded-md overflow-hidden">
              <div
                className="h-full rounded-md bg-text-primary/80"
                style={{ width: `${w}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
              {formatNum(l.avg_views)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MiniTrends({ data }: { data: AnalyticsData }) {
  const recent = data.by_year.filter(y => y.year >= 2010).sort((a, b) => a.year - b.year)
  const maxTrailers = Math.max(...recent.map(y => y.trailers), 1)

  return (
    <div className="flex items-end gap-[2px] md:gap-1" style={{ height: 120 }}>
      {recent.map((y) => {
        const h = maxTrailers > 0 ? Math.max((y.trailers / maxTrailers) * 100, 1) : 0
        return (
          <div key={y.year} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              className="w-full rounded-t-sm"
              style={{ height: `${h}%`, backgroundColor: '#000', opacity: 0.7 }}
            />
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
              <div className="bg-text-primary text-bg-base text-[10px] font-body px-2 py-1 rounded whitespace-nowrap">
                {y.year}: {formatNum(y.trailers)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniTypes({ data }: { data: AnalyticsData }) {
  const sorted = [...data.by_type].sort((a, b) => b.count - a.count).slice(0, 5)
  const maxCount = sorted.length > 0 ? sorted[0]!.count : 0
  return (
    <div className="space-y-0.5">
      {sorted.map((t) => {
        const config = TRAILER_TYPE_CONFIG[t.type as TrailerType]
        const w = maxCount > 0 ? Math.max((t.count / maxCount) * 100, 0.5) : 0
        return (
          <div key={t.type} className="flex items-center gap-3 py-1.5">
            <span className="w-32 md:w-40 shrink-0 text-right">
              <TypeBadge type={t.type} />
            </span>
            <div className="flex-1 h-6 bg-bg-surface rounded-md overflow-hidden">
              <div
                className="h-full rounded-md"
                style={{ width: `${w}%`, backgroundColor: config?.color || '#a4a4a4' }}
              />
            </div>
            <span className="w-16 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
              {formatNum(t.count)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Overview tab ---------- */

function OverviewTab({ data, onNavigate }: { data: AnalyticsData; onNavigate: (tab: TabId) => void }) {
  const { overview, by_type, by_language, top_channels_by_views } = data

  // Compute insights
  const insights = useMemo(() => {
    const result: { title: string; value: string; description: string; accent: string }[] = []

    // Highest avg views language vs English
    const english = by_language.find(l => l.lang === 'en')
    const sortedLangs = [...by_language].sort((a, b) => b.avg_views - a.avg_views)
    const topLang = sortedLangs[0]
    if (topLang && english && topLang.lang !== 'en') {
      const mult = (topLang.avg_views / english.avg_views).toFixed(1)
      result.push({
        title: 'Highest Avg Views Language',
        value: `${LANGUAGE_FLAGS[topLang.lang] || ''} ${LANGUAGE_NAMES[topLang.lang] || topLang.lang}`,
        description: `${LANGUAGE_NAMES[topLang.lang] || topLang.lang} trailers average ${formatNum(topLang.avg_views)} views, ${mult}x more than English (${formatNum(english.avg_views)}).`,
        accent: 'var(--color-type-trailer)',
      })
    }

    // Type with highest avg views
    const sortedTypes = [...by_type].sort((a, b) => b.avg_views - a.avg_views)
    const topType = sortedTypes[0]
    if (topType) {
      const typeConfig = TRAILER_TYPE_CONFIG[topType.type as TrailerType]
      result.push({
        title: 'Top Performing Type',
        value: `${typeConfig?.label || topType.type}`,
        description: `${typeConfig?.label || topType.type}s average ${formatNum(topType.avg_views)} views with ${formatNum(topType.count)} in the database.`,
        accent: typeConfig?.color || '#000',
      })
    }

    // Top channel
    if (top_channels_by_views.length > 0) {
      const topCh = top_channels_by_views[0]!
      result.push({
        title: 'Top Channel by Views',
        value: topCh.name,
        description: `${formatNum(topCh.views)} total views across ${formatNum(topCh.trailers)} trailers (${formatNum(topCh.avg_per_trailer)} avg per upload).`,
        accent: 'var(--color-type-featurette)',
      })
    }

    return result
  }, [by_type, by_language, top_channels_by_views])

  return (
    <div>
      {/* 3x3 stat grid */}
      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            value={formatNum(overview.total_views)}
            label="Total Views"
            sublabel="across all trailers"
          />
          <StatCard
            value={formatNum(overview.total_likes)}
            label="Total Likes"
          />
          <StatCard
            value={pct(overview.engagement_rate)}
            label="Engagement Rate"
            sublabel="likes / views"
          />
          <StatCard
            value={formatNum(overview.movies)}
            label="Movies"
          />
          <StatCard
            value={formatNum(overview.series)}
            label="Series"
          />
          <StatCard
            value={formatNum(overview.trailers + overview.series_trailers)}
            label="Total Trailers"
            sublabel={`${formatNum(overview.trailers)} movie + ${formatNum(overview.series_trailers)} series`}
          />
          <StatCard
            value={formatNum(overview.unique_channels)}
            label="Unique Channels"
          />
          <StatCard
            value={String(data.by_language.length)}
            label="Languages"
          />
          <StatCard
            value={formatDuration(overview.avg_duration)}
            label="Avg Duration"
          />
        </div>
      </section>

      {/* Key insights */}
      {insights.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Key Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {insights.map((insight, i) => (
              <InsightCard key={i} {...insight} />
            ))}
          </div>
        </section>
      )}

      {/* Divider */}
      <div className="border-t border-border my-10" />

      {/* Mini previews */}
      <MiniPreviewSection title="Most Viewed" tabId="engagement" onNavigate={onNavigate}>
        <MiniEngagement data={data} />
      </MiniPreviewSection>

      <MiniPreviewSection title="Top Channels" tabId="channels" onNavigate={onNavigate}>
        <MiniChannels data={data} />
      </MiniPreviewSection>

      <MiniPreviewSection title="Language Efficiency" tabId="languages" onNavigate={onNavigate}>
        <MiniLanguages data={data} />
      </MiniPreviewSection>

      <MiniPreviewSection title="Trailers per Year" tabId="trends" onNavigate={onNavigate}>
        <MiniTrends data={data} />
      </MiniPreviewSection>

      <MiniPreviewSection title="By Type" tabId="types" onNavigate={onNavigate}>
        <MiniTypes data={data} />
      </MiniPreviewSection>
    </div>
  )
}

/* ---------- Main Analytics page ---------- */

export function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabId) || 'overview'

  const { data, isLoading, error } = useAnalytics()

  function setTab(tab: TabId) {
    if (tab === 'overview') {
      setSearchParams({})
    } else {
      setSearchParams({ tab })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <SEOHead
        title="Analytics"
        description="Advanced analytics dashboard for The Trailer Database. Explore views, engagement, channels, languages, trends, and trailer types across 200B+ YouTube views."
      />

      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <header className="mb-8">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl lg:text-6xl leading-tight">
            Analytics
          </h1>
          <p className="text-text-muted font-body text-lg mt-3 max-w-2xl">
            A data-driven look at the world's largest open-source trailer database.
          </p>
        </header>

        {/* Tab bar */}
        <nav
          className="sticky top-[70px] z-30 bg-bg-base/95 backdrop-blur-sm border-b border-border -mx-4 px-4 mb-10"
          aria-label="Analytics tabs"
        >
          <div className="flex gap-1 overflow-x-auto hide-scrollbar py-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`px-4 py-2 rounded-full text-sm font-body font-medium whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4 py-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <h2 className="font-display text-text-primary text-2xl mb-3">Unable to load analytics</h2>
            <p className="text-text-muted font-body">The analytics data could not be fetched. Please try again later.</p>
          </div>
        ) : data ? (
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'overview' && <OverviewTab data={data} onNavigate={setTab} />}
            {activeTab === 'engagement' && <EngagementTab data={data} />}
            {activeTab === 'channels' && <ChannelsTab data={data} />}
            {activeTab === 'languages' && <LanguagesTab data={data} />}
            {activeTab === 'trends' && <TrendsTab data={data} />}
            {activeTab === 'types' && <TypesTab data={data} />}
          </Suspense>
        ) : null}
      </div>
    </>
  )
}
