import { useSearchParams } from 'react-router-dom'
import { MovieSearchInput } from './MovieSearchInput'

const MODES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'explore', label: 'Explore' },
  { id: 'compare', label: 'Compare' },
] as const

type Mode = (typeof MODES)[number]['id']

export function ModeBar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentMode = searchParams.get('mode') || 'dashboard'
  const hasMovieOrSeries = searchParams.has('movie') || searchParams.has('series')

  function setMode(mode: Mode) {
    if (mode === 'dashboard') {
      setSearchParams({})
    } else {
      setSearchParams({ mode })
    }
  }

  function handleMovieSelect(imdbId: string) {
    setSearchParams({ movie: imdbId })
  }

  return (
    <nav
      className="sticky top-[70px] z-30 bg-bg-base/95 backdrop-blur-sm border-b border-border -mx-4 px-4"
      aria-label="Analytics mode"
    >
      <div className="flex items-center gap-3 py-3">
        {/* Mode pills */}
        <div className="flex gap-1 shrink-0">
          {MODES.map((mode) => {
            const isActive =
              !hasMovieOrSeries && currentMode === mode.id
            return (
              <button
                key={mode.id}
                onClick={() => setMode(mode.id)}
                className={`px-4 py-2 rounded-full text-sm font-body font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {mode.label}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border shrink-0 hidden sm:block" />

        {/* Movie search */}
        <MovieSearchInput
          onSelect={handleMovieSelect}
          placeholder="Deep dive into a movie..."
          className="flex-1 max-w-xs hidden sm:block"
        />
      </div>
    </nav>
  )
}
