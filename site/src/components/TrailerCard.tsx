import type { Trailer } from '../lib/types'
import { formatDate } from '../lib/utils'
import { TypeBadge } from './Badge'
import { TrailerPlayer } from './TrailerPlayer'

export function TrailerCard({ trailer }: { trailer: Trailer }) {
  return (
    <article className="group">
      <TrailerPlayer youtubeId={trailer.youtube_id} title={trailer.title} />
      <div className="mt-2 px-0.5">
        <h4 className="text-text-primary text-sm font-body font-medium leading-tight line-clamp-2">
          {trailer.title || 'Untitled'}
        </h4>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <TypeBadge type={trailer.type} />
          {trailer.is_official && (
            <span className="text-xs text-text-muted font-body">Official</span>
          )}
          {trailer.published_at && (
            <span className="text-xs text-text-muted font-body">{formatDate(trailer.published_at)}</span>
          )}
        </div>
      </div>
    </article>
  )
}
