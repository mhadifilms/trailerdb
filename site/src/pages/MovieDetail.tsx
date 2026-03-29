import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMovieDetail } from '../lib/api'
import { imdbIdFromSlug, posterUrl, backdropUrl, formatRuntime, formatVotes, ratingColor } from '../lib/utils'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'
import { TrailerSection } from '../components/TrailerSection'
import { PlayerProvider } from '../components/PlayerContext'
import { SEOHead, movieJsonLd } from '../components/SEOHead'
import { MovieDetailSkeleton } from '../components/Skeleton'
import { ContributeForm } from '../components/ContributeForm'

/** Parse a human-readable movie name from the URL slug. */
function movieNameFromSlug(slug: string): string {
  // Slugs look like "the-dark-knight-2008-tt0468569"
  // Strip the trailing IMDb ID and optional year, then title-case the rest
  const withoutImdb = slug.replace(/-tt\d+$/, '')
  const withoutYear = withoutImdb.replace(/-\d{4}$/, '')
  return withoutYear
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

export function MovieDetail() {
  const { slug } = useParams<{ slug: string }>()
  const imdbId = slug ? imdbIdFromSlug(slug) : null
  const { data: movie, isLoading, error } = useMovieDetail(imdbId)
  const [filterLang, setFilterLang] = useState<string | null>(null)

  if (isLoading) return <MovieDetailSkeleton />

  if (error || !movie) {
    const displayName = slug ? movieNameFromSlug(slug) : 'this movie'

    return (
      <div className="min-h-screen flex flex-col items-center pt-16">
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-bg-surface/60 to-transparent pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center px-4 mt-20 mb-8 max-w-lg"
        >
          {/* Film reel icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-bg-surface border border-border flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
            </svg>
          </div>

          <h1 className="font-display text-text-primary text-3xl md:text-4xl mb-3">
            Movie Not Found
          </h1>
          {displayName && displayName !== 'this movie' && (
            <p className="text-accent font-display text-lg mb-2">
              "{displayName}"
            </p>
          )}
          <p className="text-text-secondary font-body leading-relaxed">
            This movie isn't in our database yet, but you can help us add it.
            Submit the IMDb link below and we'll fetch all available trailers.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 w-full px-4 mb-12"
        >
          <ContributeForm movieName={displayName !== 'this movie' ? displayName : undefined} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10"
        >
          <Link to="/" className="text-text-muted hover:text-accent font-body text-sm transition-colors">
            &larr; Back to Home
          </Link>
        </motion.div>
      </div>
    )
  }

  const backdrop = backdropUrl(movie.backdrop_path)
  const poster = posterUrl(movie.poster_path, 'w500')
  const jsonLd = movieJsonLd(movie)

  return (
    <PlayerProvider>
      <SEOHead
        title={`${movie.title} (${movie.year}) — All Trailers`}
        description={`Watch all ${movie.trailers.length} trailers for ${movie.title} (${movie.year}). ${movie.overview?.slice(0, 120) || ''}`}
        image={poster}
        type="video.movie"
        jsonLd={jsonLd}
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

      {/* Movie info */}
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
                alt={`${movie.title} poster`}
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
              {movie.title}
            </h1>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm font-body">
              {movie.year && <span className="text-text-secondary">{movie.year}</span>}
              {movie.runtime && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-secondary">{formatRuntime(movie.runtime)}</span>
                </>
              )}
              {movie.imdb_rating && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className={`font-semibold ${ratingColor(movie.imdb_rating)}`}>
                    ★ {movie.imdb_rating.toFixed(1)}
                  </span>
                  {movie.imdb_votes && (
                    <span className="text-text-muted">({formatVotes(movie.imdb_votes)})</span>
                  )}
                </>
              )}
            </div>

            {/* Genres */}
            {movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {movie.genres.map((genre) => (
                  <span key={genre} className="px-2.5 py-0.5 rounded-full bg-bg-surface text-text-secondary text-xs font-body font-medium border border-border">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* External links */}
            <div className="flex gap-3 mt-4">
              <a
                href={`https://www.imdb.com/title/${movie.imdb_id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-body text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              >
                IMDb ↗
              </a>
              {movie.tmdb_id && (
                <a
                  href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-body text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                >
                  TMDB ↗
                </a>
              )}
            </div>
          </motion.div>
        </div>

        {/* Overview */}
        {movie.overview && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 md:mt-10"
          >
            <p className="text-text-secondary font-body leading-relaxed max-w-3xl">
              {movie.overview}
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
            <span className="text-text-muted text-lg ml-2">({movie.trailers.length})</span>
          </h2>

          <LanguageFilter trailers={movie.trailers} onChange={setFilterLang} active={filterLang} />

          <TrailerSection trailers={movie.trailers} trailerGroups={movie.trailer_groups} filterLanguage={filterLang} />
        </motion.section>
      </div>
    </PlayerProvider>
  )
}
