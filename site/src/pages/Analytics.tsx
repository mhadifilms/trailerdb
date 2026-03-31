import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SEOHead } from '../components/SEOHead'
import { ModeBar } from '../components/analytics/ModeBar'

// Lazy-loaded mode components
const TrendingFeed = lazy(() =>
  import('./analytics/TrendingFeed').then((m) => ({ default: m.TrendingFeed })),
)
const QueryBuilder = lazy(() =>
  import('./analytics/QueryBuilder').then((m) => ({ default: m.QueryBuilder })),
)
const CompareView = lazy(() =>
  import('./analytics/CompareView').then((m) => ({ default: m.CompareView })),
)
const MovieDeepDive = lazy(() =>
  import('./analytics/MovieDeepDive').then((m) => ({ default: m.MovieDeepDive })),
)

function ModeLoading() {
  return (
    <div className="space-y-4 py-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-xl" />
      ))}
    </div>
  )
}

export function Analytics() {
  const [searchParams] = useSearchParams()

  const mode = searchParams.get('mode') || 'dashboard'
  const movieId = searchParams.get('movie')
  const seriesId = searchParams.get('series')

  // Determine which view to show
  let activeView: 'dashboard' | 'explore' | 'compare' | 'movie' | 'series' = 'dashboard'
  if (movieId) {
    activeView = 'movie'
  } else if (seriesId) {
    activeView = 'series'
  } else if (mode === 'explore') {
    activeView = 'explore'
  } else if (mode === 'compare') {
    activeView = 'compare'
  }

  // Page title based on mode
  const pageTitle =
    activeView === 'explore'
      ? 'Explore'
      : activeView === 'compare'
        ? 'Compare'
        : activeView === 'movie' || activeView === 'series'
          ? 'Deep Dive'
          : 'Analytics'

  const pageDescription =
    activeView === 'explore'
      ? 'Build custom queries across 330,000+ trailers. Group, filter, and visualize trailer data your way.'
      : activeView === 'compare'
        ? 'Compare movies, genres, languages, and channels side by side.'
        : 'Advanced analytics dashboard for The Trailer Database. Explore views, engagement, channels, languages, trends, and trailer types.'

  return (
    <>
      <SEOHead title={pageTitle} description={pageDescription} />

      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <header className="mb-4">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl lg:text-6xl leading-tight">
            Analytics
          </h1>
          <p className="text-text-muted font-body text-lg mt-3 max-w-2xl">
            A data-driven look at the world's largest open-source trailer database.
          </p>
        </header>

        {/* Mode bar */}
        <ModeBar />

        {/* Content */}
        <div className="mt-8">
          <Suspense fallback={<ModeLoading />}>
            {activeView === 'dashboard' && <TrendingFeed />}
            {activeView === 'explore' && <QueryBuilder />}
            {activeView === 'compare' && <CompareView />}
            {activeView === 'movie' && movieId && <MovieDeepDive imdbId={movieId} />}
            {activeView === 'series' && (
              <div className="text-center py-20">
                <h2 className="font-display text-text-primary text-2xl mb-3">Series Deep Dive</h2>
                <p className="text-text-muted font-body">Coming soon.</p>
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </>
  )
}
