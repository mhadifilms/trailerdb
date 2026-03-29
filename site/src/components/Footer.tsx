import { Link } from 'react-router-dom'
import { useSiteStats } from '../lib/api'

export function Footer() {
  const { data: stats } = useSiteStats()

  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {stats && (
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 mb-8">
            <StatItem value={stats.movies_with_trailers.toLocaleString()} label="Movies" />
            <StatItem value={stats.total_trailers.toLocaleString()} label="Trailers" />
            <StatItem value={`${stats.languages}+`} label="Languages" />
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-6 text-sm font-body text-text-muted">
          <Link to="/about" className="hover:text-text-primary transition-colors">About</Link>
          <Link to="/browse" className="hover:text-text-primary transition-colors">Browse</Link>
          <Link to="/api-docs" className="hover:text-text-primary transition-colors">API</Link>
          <a
            href="https://github.com/mhadifilms/trailerdb"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-primary transition-colors inline-flex items-center gap-1"
          >
            GitHub
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        <p className="text-center text-xs text-text-muted mt-6 font-body">
          Movie data from <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-text-primary hover:underline">TMDB</a>.
          The Trailer Database is an open-source project.
        </p>
      </div>
    </footer>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-text-primary text-2xl md:text-3xl">{value}</div>
      <div className="text-text-muted text-sm font-body uppercase tracking-wider mt-1">{label}</div>
    </div>
  )
}
