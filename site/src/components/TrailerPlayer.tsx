import { useState, useCallback } from 'react'
import { youtubeThumbnail } from '../lib/utils'
import { addToWatchHistory } from '../lib/storage'
import { usePlayer } from './PlayerContext'

interface TrailerPlayerProps {
  youtubeId: string
  title?: string | null
  movieId?: string
  onShare?: (youtubeId: string) => void
}

export function TrailerPlayer({ youtubeId, title, movieId, onShare }: TrailerPlayerProps) {
  const { activeId, setActive } = usePlayer()
  const isActive = activeId === youtubeId
  const [imgError, setImgError] = useState(false)
  const [copied, setCopied] = useState(false)

  const handlePlay = useCallback(() => {
    setActive(youtubeId)
    if (movieId) {
      addToWatchHistory(youtubeId, movieId)
    }
  }, [youtubeId, movieId, setActive])

  const handleShare = useCallback(() => {
    if (onShare) {
      onShare(youtubeId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [youtubeId, onShare])

  if (isActive) {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-surface">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
          title={title || 'Trailer'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
        {/* Share button overlay (top-right) */}
        {onShare && (
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={handleShare}
              className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
              aria-label="Share trailer"
              title="Copy link"
            >
              {copied ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
              )}
            </button>
            {copied && (
              <span className="absolute right-0 top-full mt-1 text-[11px] font-body text-white bg-black/70 px-2 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
                Link copied!
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  const thumbUrl = imgError
    ? youtubeThumbnail(youtubeId, 'mq')
    : youtubeThumbnail(youtubeId, 'hq')

  return (
    <div className="relative">
      <button
        onClick={handlePlay}
        className="group relative aspect-video w-full rounded-xl overflow-hidden bg-bg-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
        aria-label={`Play ${title || 'trailer'}`}
      >
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => !imgError && setImgError(true)}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-crimson/90 flex items-center justify-center transition-all duration-300 group-hover:bg-crimson group-hover:scale-110 shadow-lg shadow-crimson/30">
            <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </div>
        </div>
      </button>
      {/* Share button (bottom-right of thumbnail) */}
      {onShare && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={handleShare}
            className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
            aria-label="Share trailer"
            title="Copy link"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            )}
          </button>
          {copied && (
            <span className="absolute right-0 top-full mt-1 text-[11px] font-body text-white bg-black/70 px-2 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
              Link copied!
            </span>
          )}
        </div>
      )}
    </div>
  )
}
