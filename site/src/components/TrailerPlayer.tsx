import { useState, useCallback } from 'react'
import { youtubeThumbnail } from '../lib/utils'
import { usePlayer } from './PlayerContext'

export function TrailerPlayer({ youtubeId, title }: { youtubeId: string; title?: string | null }) {
  const { activeId, setActive } = usePlayer()
  const isActive = activeId === youtubeId
  const [imgError, setImgError] = useState(false)

  const handlePlay = useCallback(() => {
    setActive(youtubeId)
  }, [youtubeId, setActive])

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
      </div>
    )
  }

  const thumbUrl = imgError
    ? youtubeThumbnail(youtubeId, 'mq')
    : youtubeThumbnail(youtubeId, 'hq')

  return (
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
  )
}
