import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSiteStats, useBrowseIndex, useBrowseShard, useMovieDetail } from '../lib/api'
import { TRAILER_TYPE_CONFIG, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { ratingColor, imdbIdFromSlug } from '../lib/utils'
import { SEOHead } from '../components/SEOHead'
import type { TrailerType, MovieIndex } from '../lib/types'

/* ---------- helpers ---------- */

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

/* ---------- sub-components ---------- */

function StatCard({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
  return (
    <div className="p-6 rounded-xl bg-bg-surface border border-border">
      <div className="font-display text-text-primary text-3xl md:text-4xl leading-none">{value}</div>
      <div className="text-text-muted text-xs uppercase tracking-widest mt-2 font-body">{label}</div>
      {sublabel && <div className="text-text-muted text-xs mt-1 font-body">{sublabel}</div>}
    </div>
  )
}

function HBar({ label, value, max, total, color }: { label: string; value: number; max: number; total: number; color?: string }) {
  const w = max > 0 ? Math.max((value / max) * 100, 0.5) : 0
  return (
    <div className="group flex items-center gap-3 py-2">
      <span className="w-36 md:w-44 shrink-0 text-sm font-body text-text-secondary text-right truncate">{label}</span>
      <div className="flex-1 h-7 bg-bg-surface rounded-md overflow-hidden relative">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${w}%`, backgroundColor: color || '#000' }}
        />
      </div>
      <span className="w-20 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
        {formatNum(value)} <span className="opacity-60">({pct(value, total)})</span>
      </span>
    </div>
  )
}

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-text-primary text-2xl md:text-3xl mt-16 mb-6 scroll-mt-24">
      {children}
    </h2>
  )
}

function Divider() {
  return <div className="border-t border-border my-8" />
}

/* ---------- Movie-specific analytics header ---------- */

function MovieAnalyticsHeader({ imdbId }: { imdbId: string }) {
  const { data: movie, isLoading } = useMovieDetail(imdbId)

  if (isLoading) {
    return (
      <div className="mb-12">
        <div className="skeleton h-8 w-64 rounded mb-4" />
        <div className="skeleton h-4 w-48 rounded" />
      </div>
    )
  }

  if (!movie) return null

  // Compute per-movie stats
  const langCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  for (const t of movie.trailers) {
    if (t.language) langCounts[t.language] = (langCounts[t.language] || 0) + 1
    typeCounts[t.type] = (typeCounts[t.type] || 0) + 1
  }

  const langEntries = Object.entries(langCounts).sort((a, b) => b[1] - a[1])
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
  const maxType = typeEntries.length > 0 ? typeEntries[0]![1] : 0

  return (
    <div className="mb-12 p-6 md:p-8 rounded-xl bg-bg-surface border border-border">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link
            to={`/movie/${movie.slug}`}
            className="font-display text-text-primary text-2xl md:text-3xl hover:opacity-70 transition-opacity"
          >
            {movie.title}
          </Link>
          <div className="flex items-center gap-2 mt-1 text-sm font-body text-text-muted">
            {movie.year && <span>{movie.year}</span>}
            {movie.imdb_rating && (
              <>
                <span>·</span>
                <span className={ratingColor(movie.imdb_rating)}>★ {movie.imdb_rating.toFixed(1)}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-text-primary text-3xl">{movie.trailers.length}</div>
          <div className="text-text-muted text-xs uppercase tracking-wider font-body">Trailers</div>
        </div>
      </div>

      {/* Languages available */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-text-muted font-body mb-2">
          Languages ({langEntries.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {langEntries.map(([lang, count]) => (
            <span
              key={lang}
              className="px-2.5 py-1 rounded-full bg-bg-base text-text-secondary text-xs font-body border border-border"
            >
              {LANGUAGE_FLAGS[lang] || ''} {LANGUAGE_NAMES[lang] || lang.toUpperCase()} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* Type breakdown */}
      <div>
        <div className="text-xs uppercase tracking-wider text-text-muted font-body mb-2">
          Types Breakdown
        </div>
        <div className="space-y-1">
          {typeEntries.map(([type, count]) => {
            const config = TRAILER_TYPE_CONFIG[type as TrailerType]
            return (
              <HBar
                key={type}
                label={config?.label || type}
                value={count}
                max={maxType}
                total={movie.trailers.length}
                color={config?.color || '#a4a4a4'}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Main Analytics page ---------- */

export function Analytics() {
  const [searchParams] = useSearchParams()
  const movieParam = searchParams.get('movie')

  const { data: stats, isLoading: statsLoading } = useSiteStats()
  const { data: indexData, isLoading: indexLoading } = useBrowseIndex()
  const { data: mostTrailers } = useBrowseShard('most-trailers.json')
  const { data: trending } = useBrowseShard('trending.json')

  // Compute derived analytics from the full index
  const analytics = useMemo(() => {
    if (!indexData) return null
    const { movies } = indexData

    // By decade
    const byDecade: Record<string, { movies: number; trailers: number }> = {}
    // Rating bands
    const ratingBands: Record<string, { movies: number; trailers: number }> = {}

    for (const m of movies) {
      // Decade
      if (m.year) {
        const decade = `${Math.floor(m.year / 10) * 10}s`
        if (!byDecade[decade]) byDecade[decade] = { movies: 0, trailers: 0 }
        byDecade[decade]!.movies++
        byDecade[decade]!.trailers += m.trailer_count
      }

      // Rating bands
      if (m.rating != null && m.rating > 0) {
        const lower = Math.floor(m.rating * 2) / 2 // 0.5 step
        const bandKey = `${lower.toFixed(1)}-${(lower + 0.5).toFixed(1)}`
        if (!ratingBands[bandKey]) ratingBands[bandKey] = { movies: 0, trailers: 0 }
        ratingBands[bandKey]!.movies++
        ratingBands[bandKey]!.trailers += m.trailer_count
      }
    }

    // Sort decades chronologically
    const decades = Object.entries(byDecade)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .filter(([decade]) => parseInt(decade) >= 1950)

    // Sort rating bands
    const ratings = Object.entries(ratingBands)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .filter(([band]) => parseFloat(band) >= 3.0)

    // Total series count (using the series presence in the index)
    const totalMovies = movies.length
    const avgTrailers = totalMovies > 0 ? movies.reduce((s, m) => s + m.trailer_count, 0) / totalMovies : 0

    return { decades, ratings, totalMovies, avgTrailers }
  }, [indexData])

  const loading = statsLoading || indexLoading

  return (
    <>
      <SEOHead
        title="Analytics"
        description="Explore analytics and statistics for The Trailer Database. Trailer counts by type, language coverage, decade trends, and more."
      />

      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <header className="mb-12">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl lg:text-6xl leading-tight">
            Analytics
          </h1>
          <p className="text-text-muted font-body text-lg mt-3 max-w-2xl">
            A data-driven look at the world's largest open-source trailer database.
          </p>

          {/* Jump links */}
          <nav className="flex flex-wrap gap-2 mt-6" aria-label="Analytics sections">
            {[
              ['#overview', 'Overview'],
              ['#types', 'Types'],
              ['#languages', 'Languages'],
              ['#decades', 'Decades'],
              ['#top-movies', 'Top Movies'],
              ['#latest', 'Latest'],
              ['#ratings', 'Ratings'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-3 py-1 rounded-full bg-bg-surface text-text-secondary text-xs font-body font-medium border border-border hover:border-border-hover hover:text-text-primary transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        {/* Movie-specific header */}
        {movieParam && <MovieAnalyticsHeader imdbId={movieParam} />}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* ---- Overview Stats ---- */}
            <SectionHeading id="overview">Overview</SectionHeading>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                value={stats ? formatNum(stats.movies_with_trailers) : '--'}
                label="Movies"
              />
              <StatCard
                value={stats ? formatNum(stats.total_trailers) : '--'}
                label="Trailers"
              />
              <StatCard
                value={stats ? `${stats.languages}` : '--'}
                label="Languages"
              />
              <StatCard
                value={analytics ? analytics.avgTrailers.toFixed(1) : '--'}
                label="Avg per Movie"
                sublabel="trailers per movie"
              />
            </div>

            <Divider />

            {/* ---- Trailer Type Breakdown ---- */}
            <SectionHeading id="types">Trailer Type Breakdown</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Distribution of {stats ? formatNum(stats.total_trailers) : ''} trailers across content types.
            </p>

            {stats && (() => {
              const entries = Object.entries(stats.by_type).sort((a, b) => b[1] - a[1])
              const maxVal = entries.length > 0 ? entries[0]![1] : 0
              return (
                <div className="space-y-0.5">
                  {entries.map(([type, count]) => {
                    const config = TRAILER_TYPE_CONFIG[type as TrailerType]
                    return (
                      <HBar
                        key={type}
                        label={config?.label || type}
                        value={count}
                        max={maxVal}
                        total={stats.total_trailers}
                        color={config?.color || '#a4a4a4'}
                      />
                    )
                  })}
                </div>
              )
            })()}

            <Divider />

            {/* ---- Language Coverage ---- */}
            <SectionHeading id="languages">Language Coverage</SectionHeading>

            {stats && (() => {
              const entries = Object.entries(stats.by_language).sort((a, b) => b[1] - a[1])
              const maxVal = entries.length > 0 ? entries[0]![1] : 0
              const englishCount = stats.by_language['en'] || 0
              const englishPct = pct(englishCount, stats.total_trailers)
              return (
                <>
                  {/* English callout */}
                  <div className="px-5 py-4 rounded-xl bg-bg-surface border border-border mb-6">
                    <span className="font-display text-text-primary text-xl">{englishPct}</span>
                    <span className="text-text-muted font-body text-sm ml-2">of all trailers are in English</span>
                  </div>

                  <div className="space-y-0.5">
                    {entries.map(([lang, count]) => {
                      const flag = LANGUAGE_FLAGS[lang] || ''
                      const name = LANGUAGE_NAMES[lang] || lang.toUpperCase()
                      return (
                        <HBar
                          key={lang}
                          label={`${flag} ${name}`}
                          value={count}
                          max={maxVal}
                          total={stats.total_trailers}
                          color="#000"
                        />
                      )
                    })}
                  </div>
                </>
              )
            })()}

            <Divider />

            {/* ---- Trailers by Decade ---- */}
            <SectionHeading id="decades">Trailers by Decade</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              How trailer coverage varies across movie eras.
            </p>

            {analytics && analytics.decades.length > 0 && (() => {
              const maxMovies = Math.max(...analytics.decades.map(d => d[1].movies))
              const maxTrailers = Math.max(...analytics.decades.map(d => d[1].trailers))
              return (
                <div className="overflow-x-auto">
                  <table className="w-full font-body text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Decade</th>
                        <th className="text-right py-3 px-4 text-text-muted text-xs uppercase tracking-wider font-medium">Movies</th>
                        <th className="py-3 px-4 text-text-muted text-xs uppercase tracking-wider font-medium text-left">Distribution</th>
                        <th className="text-right py-3 pl-4 text-text-muted text-xs uppercase tracking-wider font-medium">Trailers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.decades.map(([decade, data]) => (
                        <tr key={decade} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                          <td className="py-3 pr-4 font-display text-text-primary text-base">{decade}</td>
                          <td className="py-3 px-4 text-right text-text-secondary tabular-nums">{data.movies.toLocaleString()}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-4 bg-bg-surface rounded overflow-hidden">
                                <div
                                  className="h-full rounded bg-text-primary/80 transition-all duration-500"
                                  style={{ width: `${(data.movies / maxMovies) * 100}%` }}
                                />
                              </div>
                              <div className="flex-1 h-4 bg-bg-surface rounded overflow-hidden">
                                <div
                                  className="h-full rounded bg-text-muted/60 transition-all duration-500"
                                  style={{ width: `${(data.trailers / maxTrailers) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                              <span>Movies</span>
                              <span>Trailers</span>
                            </div>
                          </td>
                          <td className="py-3 pl-4 text-right text-text-secondary tabular-nums">{data.trailers.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <Divider />

            {/* ---- Top Movies by Trailer Count ---- */}
            <SectionHeading id="top-movies">Top Movies by Trailer Count</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              The 20 movies with the most trailers and videos in our database.
            </p>

            {mostTrailers && (() => {
              const top20 = mostTrailers.slice(0, 20)
              return (
                <div className="overflow-x-auto">
                  <table className="w-full font-body text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-2 w-8 text-text-muted text-xs uppercase tracking-wider font-medium">#</th>
                        <th className="text-left py-3 pr-4 text-text-muted text-xs uppercase tracking-wider font-medium">Title</th>
                        <th className="text-center py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Year</th>
                        <th className="text-center py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">Rating</th>
                        <th className="text-right py-3 pl-3 text-text-muted text-xs uppercase tracking-wider font-medium">Trailers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top20.map((movie: MovieIndex, i: number) => (
                        <tr key={movie.imdb_id} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                          <td className="py-3 pr-2 text-text-muted tabular-nums">{i + 1}</td>
                          <td className="py-3 pr-4">
                            <Link
                              to={`/movie/${movie.slug}`}
                              className="text-text-primary hover:text-text-secondary transition-colors font-medium"
                            >
                              {movie.title}
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-center text-text-secondary">{movie.year || '—'}</td>
                          <td className={`py-3 px-3 text-center font-semibold ${ratingColor(movie.rating)}`}>
                            {movie.rating ? `★ ${movie.rating.toFixed(1)}` : '—'}
                          </td>
                          <td className="py-3 pl-3 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-display text-text-primary text-lg leading-none">{movie.trailer_count}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <Divider />

            {/* ---- Latest Additions ---- */}
            <SectionHeading id="latest">Latest Additions</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Trending movies recently added or updated with new trailers.
            </p>

            {trending && (() => {
              const recent = trending.slice(0, 12)
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recent.map((movie: MovieIndex) => (
                    <Link
                      key={movie.imdb_id}
                      to={`/movie/${movie.slug}`}
                      className="group p-4 rounded-xl bg-bg-surface border border-border hover:border-border-hover transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-display text-text-primary text-base group-hover:text-text-secondary transition-colors truncate">
                            {movie.title}
                          </div>
                          <div className="text-text-muted text-xs font-body mt-0.5">
                            {movie.year || 'TBA'}
                            {movie.rating ? ` · ★ ${movie.rating.toFixed(1)}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-display text-text-primary text-lg leading-none">{movie.trailer_count}</span>
                          <div className="text-text-muted text-[10px] font-body">trailers</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            })()}

            <Divider />

            {/* ---- Rating vs Trailer Count ---- */}
            <SectionHeading id="ratings">Rating vs. Trailer Count</SectionHeading>
            <p className="text-text-muted font-body text-sm mb-6 -mt-3">
              Average number of trailers per movie, grouped by IMDb rating band.
            </p>

            {analytics && analytics.ratings.length > 0 && (() => {
              const data = analytics.ratings.map(([band, d]) => ({
                band,
                movies: d.movies,
                trailers: d.trailers,
                avg: d.movies > 0 ? d.trailers / d.movies : 0,
              }))
              const maxAvg = Math.max(...data.map(d => d.avg))

              return (
                <div className="space-y-2">
                  {data.map(({ band, movies, trailers, avg }) => (
                    <div key={band} className="flex items-center gap-3 py-1.5">
                      <span className="w-20 shrink-0 text-sm font-body text-text-secondary text-right tabular-nums">
                        ★ {band}
                      </span>
                      <div className="flex-1 h-6 bg-bg-surface rounded overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{
                            width: `${maxAvg > 0 ? (avg / maxAvg) * 100 : 0}%`,
                            backgroundColor: parseFloat(band) >= 7 ? 'var(--color-rating-green)' :
                              parseFloat(band) >= 5 ? 'var(--color-rating-gold)' : 'var(--color-rating-red)',
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-xs font-body text-text-muted text-right tabular-nums">
                        {avg.toFixed(2)} avg
                        <span className="opacity-60 ml-1">({formatNum(movies)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Footer note */}
            <div className="mt-16 pt-8 border-t border-border text-center">
              <p className="text-text-muted font-body text-sm">
                Data sourced from{' '}
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-text-primary hover:underline">
                  TMDB
                </a>{' '}
                and enriched with YouTube metadata.
              </p>
              <p className="text-text-muted font-body text-xs mt-1">
                Statistics are updated periodically as new trailers are discovered.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
