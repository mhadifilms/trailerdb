import { Link } from 'react-router-dom'
import type { GenreMeta } from '../lib/types'

export function GenreCard({ genre }: { genre: GenreMeta }) {
  return (
    <Link
      to={`/browse/genre/${genre.slug}`}
      className="group relative overflow-hidden rounded-lg bg-bg-surface h-28 flex items-end p-4 transition-all duration-300 hover:ring-1 hover:ring-accent/30 hover:shadow-lg hover:shadow-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-bg-overlay to-bg-surface opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="relative z-10">
        <h3 className="font-display text-text-primary text-lg group-hover:text-accent transition-colors">
          {genre.name}
        </h3>
        <p className="text-text-muted text-xs font-body mt-0.5">
          {genre.count.toLocaleString()} movies
        </p>
      </div>
    </Link>
  )
}
