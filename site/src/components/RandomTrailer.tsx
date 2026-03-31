import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useBrowseIndex, useMovieDetail } from '../lib/api'
import { ratingColor, posterUrl, formatRuntime } from '../lib/utils'
import { PlayerProvider } from './PlayerContext'
import { TrailerPlayer } from './TrailerPlayer'
import type { MovieIndex } from '../lib/types'

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function RandomTrailer() {
  const { data: indexData, isLoading: indexLoading } = useBrowseIndex()
  const [picked, setPicked] = useState<MovieIndex | null>(null)
  const [trailerIdx, setTrailerIdx] = useState(0)
  const [rolling, setRolling] = useState(false)

  // Pick a random movie that has trailers
  const pickNew = useCallback(() => {
    if (!indexData) return
    const candidates = indexData.movies.filter(m => m.trailer_count > 0)
    if (candidates.length === 0) return

    setRolling(true)
    const choice = pickRandom(candidates)
    setPicked(choice)
    setTrailerIdx(0)

    // Brief delay so the "rolling" state is visible
    setTimeout(() => setRolling(false), 300)
  }, [indexData])

  // Auto-pick on first load
  useEffect(() => {
    if (indexData && !picked) {
      pickNew()
    }
  }, [indexData, picked, pickNew])

  const { data: movie, isLoading: movieLoading } = useMovieDetail(picked?.imdb_id ?? null)

  // Pick a random trailer from the fetched movie
  useEffect(() => {
    if (movie && movie.trailers.length > 0) {
      setTrailerIdx(Math.floor(Math.random() * movie.trailers.length))
    }
  }, [movie])

  const isLoading = indexLoading || movieLoading || rolling

  if (indexLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="skeleton w-full max-w-3xl aspect-video rounded-xl mb-6" />
        <div className="skeleton h-8 w-64 rounded mb-3" />
        <div className="skeleton h-4 w-48 rounded" />
      </div>
    )
  }

  const trailer = movie?.trailers[trailerIdx]
  const poster = movie?.poster_path ? posterUrl(movie.poster_path, 'w185') : null

  return (
    <div className="flex flex-col items-center">
      {/* Trailer player */}
      <div className="w-full max-w-3xl">
        {isLoading || !trailer ? (
          <div className="aspect-video rounded-xl bg-bg-surface skeleton" />
        ) : (
          <PlayerProvider>
            <TrailerPlayer youtubeId={trailer.youtube_id} title={trailer.title || movie?.title} />
          </PlayerProvider>
        )}
      </div>

      {/* Movie info */}
      {movie && !isLoading && (
        <div className="mt-6 text-center max-w-xl">
          <div className="flex items-center justify-center gap-4 mb-3">
            {poster && (
              <img
                src={poster}
                alt=""
                className="w-12 h-[72px] rounded object-cover shadow-md hidden sm:block"
              />
            )}
            <div>
              <Link
                to={`/movie/${movie.slug}`}
                className="font-display text-text-primary text-xl md:text-2xl hover:opacity-70 transition-opacity"
              >
                {movie.title}
              </Link>
              <div className="flex items-center justify-center gap-2 text-sm font-body text-text-muted mt-0.5">
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime ? (
                  <>
                    <span>·</span>
                    <span>{formatRuntime(movie.runtime)}</span>
                  </>
                ) : null}
                {movie.imdb_rating && (
                  <>
                    <span>·</span>
                    <span className={ratingColor(movie.imdb_rating)}>★ {movie.imdb_rating.toFixed(1)}</span>
                  </>
                )}
              </div>
              {movie.genres.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                  {movie.genres.slice(0, 4).map(g => (
                    <span key={g} className="px-2 py-0.5 rounded-full bg-bg-surface text-text-secondary text-xs font-body border border-border">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {trailer && trailer.title && (
            <p className="text-text-muted font-body text-sm mt-2 italic">
              "{trailer.title}"
            </p>
          )}

          {movie.trailers.length > 1 && (
            <p className="text-text-muted font-body text-xs mt-2">
              This movie has{' '}
              <Link to={`/movie/${movie.slug}`} className="text-text-primary hover:underline">
                {movie.trailers.length} trailers
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-8">
        <button
          onClick={pickNew}
          disabled={isLoading || !indexData}
          className="group px-6 py-3 rounded-xl bg-text-primary text-bg-base font-body font-semibold text-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Another!
          </span>
        </button>

        {movie && (
          <Link
            to={`/movie/${movie.slug}`}
            className="px-5 py-3 rounded-xl bg-bg-surface text-text-secondary font-body font-medium text-sm border border-border hover:border-border-hover hover:text-text-primary transition-colors"
          >
            View All Trailers
          </Link>
        )}
      </div>
    </div>
  )
}
