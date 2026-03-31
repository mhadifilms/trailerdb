import { useMemo } from 'react'
import type { AnalyticsData } from '../../lib/types'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../../lib/constants'
import { InsightCard } from '../../components/analytics/InsightCard'
import { DataTable, type Column } from '../../components/analytics/DataTable'

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function langName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase()
}

function langFlag(code: string): string {
  return LANGUAGE_FLAGS[code] || ''
}

interface Props {
  data: AnalyticsData
}

export function LanguagesTab({ data }: Props) {
  const { by_language, multilingual_stats } = data

  // Sort by avg views for the efficiency ranking
  const sortedByAvg = useMemo(() => {
    return [...by_language].sort((a, b) => b.avg_views - a.avg_views)
  }, [by_language])

  const maxAvgViews = sortedByAvg.length > 0 ? sortedByAvg[0]!.avg_views : 0

  // Find Hindi and English for callout
  const hindi = by_language.find(l => l.lang === 'hi')
  const english = by_language.find(l => l.lang === 'en')

  // Top language by avg views
  const topLang = sortedByAvg.length > 0 ? sortedByAvg[0]! : null

  type LangRow = AnalyticsData['by_language'][number]
  const tableColumns: Column<LangRow>[] = [
    {
      header: '#',
      accessor: () => '',
      sortValue: (r) => r.avg_views,
      align: 'left',
      className: 'w-8',
    },
    {
      header: 'Language',
      accessor: (r) => (
        <span className="font-medium text-text-primary">
          {langFlag(r.lang)} {langName(r.lang)}
        </span>
      ),
      sortValue: (r) => langName(r.lang),
    },
    {
      header: 'Trailers',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.count)}</span>,
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
      accessor: (r) => <span className="tabular-nums font-medium text-text-primary">{formatNum(r.avg_views)}</span>,
      sortValue: (r) => r.avg_views,
      align: 'right',
    },
    {
      header: 'Avg Likes',
      accessor: (r) => <span className="tabular-nums">{formatNum(r.avg_likes)}</span>,
      sortValue: (r) => r.avg_likes,
      align: 'right',
    },
  ]

  return (
    <div>
      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {topLang && topLang.lang !== 'en' && english && (
          <InsightCard
            title="Highest Avg Views Language"
            value={`${langFlag(topLang.lang)} ${langName(topLang.lang)}`}
            description={`${langName(topLang.lang)} trailers average ${formatNum(topLang.avg_views)} views, ${(topLang.avg_views / english.avg_views).toFixed(1)}x more than English (${formatNum(english.avg_views)} avg).`}
            accent="var(--color-type-trailer)"
          />
        )}
        {hindi && english && (
          <InsightCard
            title="Hindi Dominance"
            value={`${formatNum(hindi.total_views)} views`}
            description={`Hindi trailers account for ${formatNum(hindi.count)} uploads with ${formatNum(hindi.total_views)} total views and an average of ${formatNum(hindi.avg_views)} per trailer.`}
            accent="var(--color-crimson)"
          />
        )}
      </div>

      {/* Language efficiency bar chart */}
      <section className="mb-16">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Language Efficiency Ranking
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          Languages ranked by average views per trailer — revealing which audiences engage most.
        </p>

        <div className="space-y-0.5 mb-8">
          {sortedByAvg.slice(0, 15).map((lang, i) => {
            const w = maxAvgViews > 0 ? Math.max((lang.avg_views / maxAvgViews) * 100, 0.5) : 0
            return (
              <div key={lang.lang} className="group flex items-center gap-3 py-2">
                <span className="w-6 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                  {i + 1}
                </span>
                <span className="w-32 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">
                  {langFlag(lang.lang)} {langName(lang.lang)}
                </span>
                <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-500 bg-text-primary/80"
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                  {formatNum(lang.avg_views)}
                </span>
              </div>
            )
          })}
        </div>

        <DataTable columns={tableColumns} data={sortedByAvg} keyFn={(r) => r.lang} />
      </section>

      {/* Multilingual stats */}
      <section>
        <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">
          Multilingual Coverage
        </h2>
        <p className="text-text-muted font-body text-sm mb-6">
          How many movies have trailers in multiple languages.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="p-6 rounded-xl bg-bg-surface border border-border">
            <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">
              {formatNum(multilingual_stats.movies_with_multiple_langs)}
            </div>
            <div className="text-text-muted text-xs uppercase tracking-widest mt-2 font-body">
              Movies with 2+ Languages
            </div>
          </div>
          <div className="p-6 rounded-xl bg-bg-surface border border-border">
            <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">
              {multilingual_stats.avg_langs.toFixed(1)}
            </div>
            <div className="text-text-muted text-xs uppercase tracking-widest mt-2 font-body">
              Avg Languages per Movie
            </div>
          </div>
        </div>

        {multilingual_stats.top_lang_pairs.length > 0 && (
          <>
            <h3 className="font-display text-text-primary text-xl mb-4">Most Common Language Pairs</h3>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full font-body text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">#</th>
                    <th className="text-left py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Language Pair</th>
                    <th className="text-right py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Movies</th>
                  </tr>
                </thead>
                <tbody>
                  {multilingual_stats.top_lang_pairs.slice(0, 15).map(([lang1, lang2, count], i) => (
                    <tr key={`${lang1}-${lang2}`} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                      <td className="py-3 px-3 text-text-muted tabular-nums">{i + 1}</td>
                      <td className="py-3 px-3 text-text-primary font-medium">
                        {langFlag(lang1)} {langName(lang1)} + {langFlag(lang2)} {langName(lang2)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-text-secondary">{formatNum(count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
