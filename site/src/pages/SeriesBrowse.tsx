import { useState } from 'react'
import { useSeriesBrowseShard } from '../lib/api'
import type { SeriesIndex } from '../lib/types'
import { SeriesCard } from '../components/SeriesCard'
import { SEOHead } from '../components/SEOHead'

type SortTab = 'trending' | 'top-rated'

const TABS: { key: SortTab; label: string; shard: string }[] = [
  { key: 'trending', label: 'Trending', shard: 'series-trending.json' },
  { key: 'top-rated', label: 'Top Rated', shard: 'series-top-rated.json' },
]

function SeriesGrid({ series, isLoading }: { series: SeriesIndex[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] rounded-xl" />
            <div className="mt-2 space-y-1.5">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!series || series.length === 0) {
    return (
      <p className="text-text-muted text-sm font-body py-8 text-center">
        No series found.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
      {series.map((s, i) => (
        <SeriesCard key={s.tmdb_id} series={s} index={i} />
      ))}
    </div>
  )
}

export function SeriesBrowse() {
  const [activeTab, setActiveTab] = useState<SortTab>('trending')
  const activeShard = TABS.find((t) => t.key === activeTab)!.shard
  const { data: series, isLoading } = useSeriesBrowseShard(activeShard)

  return (
    <>
      <SEOHead
        title="Series Trailers"
        description="Browse trailers for TV series. Trending and top-rated shows with all their trailers, teasers, and clips."
      />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-6">
          Series Trailers
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-body font-medium transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-[#383838] text-white'
                  : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <SeriesGrid series={series} isLoading={isLoading} />
      </div>
    </>
  )
}
