import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSeriesDetail } from '../lib/api'
import { tmdbIdFromSlug, posterUrl, backdropUrl, formatVotes, ratingColor } from '../lib/utils'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { TrailerSection } from '../components/TrailerSection'
import { PlayerProvider } from '../components/PlayerContext'
import { SEOHead } from '../components/SEOHead'
import { MovieDetailSkeleton } from '../components/Skeleton'
import type { Trailer } from '../lib/types'

/** Parse a human-readable series name from the URL slug. */
function seriesNameFromSlug(slug: string): string {
  // Slugs look like "breaking-bad-1396"
  // Strip the trailing TMDB ID, then title-case the rest
  const withoutId = slug.replace(/-\d+$/, '')
  return withoutId
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Map SeriesTrailer fields to Trailer interface for TrailerSection compatibility */
function mapSeriesToMovieTrailers(seriesTrailers: { youtube_id: string; title: string | null; trailer_type: string; language: string | null; region: string | null; is_official: boolean; published_at: string | null; quality: number | null }[]): Trailer[] {
  return seriesTrailers.map((t) => ({
    youtube_id: t.youtube_id,
    title: t.title,
    type: t.trailer_type as Trailer['type'],
    language: t.language,
    region: t.region,
    is_official: t.is_official,
    published_at: t.published_at,
    quality: t.quality,
    channel_name: null,
    duration: null,
    views: null,
  }))
}

function LanguageFilter({ trailers, onChange, active }: { trailers: { language: string | null }[]; onChange: (lang: string | null) => void; active: string | null }) {
  const langCounts = new Map<string, number>()
  for (const t of trailers) {
    if (t.language) langCounts.set(t.language, (langCounts.get(t.language) || 0) + 1)
  }
  if (langCounts.size <= 1) return null
  const sorted = [...langCounts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-3 mb-4">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-body font-medium transition-colors cursor-pointer ${
          active === null ? 'bg-[#383838] text-white' : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
        }`}
      >
        All ({trailers.length})
      </button>
      {sorted.map(([lang, count]) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-body font-medium transition-colors cursor-pointer ${
            active === lang ? 'bg-[#383838] text-white' : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
          }`}
        >
          {LANGUAGE_FLAGS[lang] || ''} {LANGUAGE_NAMES[lang] || lang.toUpperCase()} ({count})
        </button>
      ))}
    </div>
  )
}

export function SeriesDetail() {
  const { slug } = useParams<{ slug: string }>()
  const tmdbId = slug ? tmdbIdFromSlug(slug) : null
  const { data: series, isLoading, error } = useSeriesDetail(tmdbId)
  const [filterLang, setFilterLang] = useState<string | null>(null)

  if (isLoading) return <MovieDetailSkeleton />

  if (error || !series) {
    const displayName = slug ? seriesNameFromSlug(slug) : 'this series'

    return (
      <div className="min-h-screen flex flex-col items-center pt-16">
        <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-bg-surface/60 to-transparent pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center px-4 mt-20 mb-8 max-w-lg"
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-bg-surface border border-border flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-3">
            Series Not Found
          </h1>
          {displayName && displayName !== 'this series' && (
            <p className="text-accent font-display text-lg mb-2">
              "{displayName}"
            </p>
          )}
          <p className="text-text-secondary font-body leading-relaxed">
            This series isn't in our database yet.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10"
        >
          <Link to="/series" className="text-text-muted hover:text-accent font-body text-sm transition-colors">
            &larr; Back to Series
          </Link>
        </motion.div>
      </div>
    )
  }

  const backdrop = backdropUrl(series.backdrop_path)
  const poster = posterUrl(series.poster_path, 'w500')
  const year = series.first_air_date ? series.first_air_date.slice(0, 4) : null
  const trailers = mapSeriesToMovieTrailers(series.trailers)

  return (
    <PlayerProvider>
      <SEOHead
        title={`${series.name}${year ? ` (${year})` : ''} — All Trailers`}
        description={`Watch all ${series.trailers.length} trailers for ${series.name}. ${series.overview?.slice(0, 120) || ''}`}
        image={poster}
      />

      {/* Hero backdrop */}
      <section className="relative h-[50vh] min-h-[400px] overflow-hidden">
        {backdrop ? (
          <motion.img
            initial={{ scale: 1.05 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.5 }}
            src={backdrop}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-bg-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/50 to-bg-base/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg-base/60 via-transparent to-bg-base/60" />
      </section>

      {/* Series info */}
      <div className="max-w-7xl mx-auto px-4 -mt-40 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Poster */}
          {poster && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="hidden md:block shrink-0"
            >
              <img
                src={poster}
                alt={`${series.name} poster`}
                className="w-[200px] lg:w-[240px] rounded-lg shadow-2xl shadow-black/50"
              />
            </motion.div>
          )}

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1 pt-4 md:pt-12"
          >
            <h1 className="font-display text-text-primary text-3xl md:text-4xl lg:text-5xl leading-tight">
              {series.name}
            </h1>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm font-body">
              {year && <span className="text-text-secondary">{year}</span>}
              {series.number_of_seasons != null && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-secondary">
                    {series.number_of_seasons} {series.number_of_seasons === 1 ? 'Season' : 'Seasons'}
                  </span>
                </>
              )}
              {series.status && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-secondary">{series.status}</span>
                </>
              )}
              {series.vote_average != null && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className={`font-semibold ${ratingColor(series.vote_average)}`}>
                    ★ {series.vote_average.toFixed(1)}
                  </span>
                  {series.vote_count != null && (
                    <span className="text-text-muted">({formatVotes(series.vote_count)})</span>
                  )}
                </>
              )}
            </div>

            {/* Genres */}
            {series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {series.genres.map((genre) => (
                  <span key={genre} className="px-2.5 py-0.5 rounded-full bg-bg-surface text-text-secondary text-xs font-body font-medium border border-border">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* External links */}
            <div className="flex gap-3 mt-4">
              <a
                href={`https://www.themoviedb.org/tv/${series.tmdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-body text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              >
                TMDB ↗
              </a>
            </div>
          </motion.div>
        </div>

        {/* Overview */}
        {series.overview && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 md:mt-10"
          >
            <p className="text-text-secondary font-body leading-relaxed max-w-3xl">
              {series.overview}
            </p>
          </motion.section>
        )}

        {/* Divider */}
        <div className="border-t border-border mt-8 md:mt-10" />

        {/* Trailers section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8"
        >
          <h2 className="font-display text-text-primary text-2xl mb-3">
            Trailers & Videos
            <span className="text-text-muted text-lg ml-2">({series.trailers.length})</span>
          </h2>

          <LanguageFilter trailers={trailers} onChange={setFilterLang} active={filterLang} />

          <TrailerSection trailers={trailers} filterLanguage={filterLang} />
        </motion.section>
      </div>
    </PlayerProvider>
  )
}
