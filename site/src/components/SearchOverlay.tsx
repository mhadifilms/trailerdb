import { useState, useRef, useEffect, useCallback, useDeferredValue } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useBrowseIndex } from '../lib/api'
import { searchMovies } from '../lib/search'
import { posterUrl } from '../lib/utils'
import type { MovieIndex } from '../lib/types'

/**
 * Search overlay modal — used on non-home pages.
 * Same Figma search design (poster grid) but in a blurred backdrop overlay.
 */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data } = useBrowseIndex()

  const results = data ? searchMovies(data.movies, deferredQuery, 10) : []
  const hasResults = deferredQuery.length >= 2 && results.length > 0
  const noResults = deferredQuery.length >= 2 && results.length === 0 && !!data

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const goTo = useCallback((movie: MovieIndex) => {
    navigate(`/movie/${movie.slug}`)
    onClose()
  }, [navigate, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Search movies"
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-white/70 backdrop-blur-md" />

          {/* Search panel — same Figma design */}
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            ref={panelRef}
            className={`relative w-full max-w-[639px] bg-[#fffefe] shadow-[1px_1px_20px_-10px_rgba(0,0,0,0.5)] overflow-hidden ${
              hasResults || noResults ? 'rounded-[30px]' : 'rounded-[55px]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="h-14 flex items-center px-10 gap-3">
              <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) goTo(results[0])
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Search for cinema"
                className="flex-1 bg-transparent text-xl font-display text-[#383838] tracking-[-0.02em] placeholder:text-text-muted outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <button onClick={onClose} className="text-text-muted hover:text-[#383838] cursor-pointer transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Results */}
            {hasResults && (
              <div>
                <div className="mx-10 border-t border-[#e5e5e5]" />
                <div className="px-10 pt-3 pb-5">
                  {/* Movies */}
                  <div className="mb-5">
                    <h3 className="font-display text-[#383838] text-base tracking-[-0.02em] mb-2.5">Movies</h3>
                    <div className="flex gap-2 items-start">
                      <div className="flex gap-2 flex-1 overflow-x-auto hide-scrollbar">
                        {results.slice(0, 5).map((m) => (
                          <button key={m.imdb_id} onClick={() => goTo(m)} className="shrink-0 w-[98px] cursor-pointer group text-left">
                            <div className="w-[98px] h-[125px] rounded-[10px] overflow-hidden bg-[#d9d9d9]">
                              {m.poster ? (
                                <img src={posterUrl(m.poster, 'w185')!} alt={m.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px] font-body p-1 text-center">{m.title}</div>
                              )}
                            </div>
                            <p className="font-body text-[#383838] text-xs tracking-[-0.02em] mt-1.5 truncate group-hover:text-text-muted transition-colors">{m.title}</p>
                          </button>
                        ))}
                      </div>
                      {results.length > 5 && (
                        <Link to={`/search?q=${encodeURIComponent(query)}`} onClick={onClose} className="shrink-0 flex flex-col items-center gap-1 mt-10 text-[#383838] hover:text-text-muted transition-colors">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <circle cx="12" cy="12" r="10" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 8l4 4-4 4" />
                          </svg>
                          <span className="font-display text-[10px] tracking-[-0.02em]">View All</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Series placeholder */}
                  <div className="mb-4">
                    <h3 className="font-display text-[#383838] text-base tracking-[-0.02em] mb-2.5">Series</h3>
                    <div className="flex gap-2 opacity-40">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="shrink-0 w-[98px]">
                          <div className="w-[98px] h-[125px] rounded-[10px] bg-[#d9d9d9]" />
                          <p className="font-body text-[#383838] text-xs mt-1.5">Coming soon</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Not finding */}
                  <div className="text-center pt-1">
                    <p className="font-display text-xs tracking-[-0.02em]">
                      <span className="text-text-muted">Not finding what you're looking for? </span>
                      <Link to="/movie/not-found" onClick={onClose} className="text-[#383838] underline hover:text-text-muted transition-colors">
                        add a new title
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {noResults && (
              <div>
                <div className="mx-10 border-t border-[#e5e5e5]" />
                <div className="px-10 py-6 text-center">
                  <p className="text-text-muted text-sm font-body mb-2">No results for "{deferredQuery}"</p>
                  <Link to="/movie/not-found" onClick={onClose} className="font-display text-xs text-[#383838] underline">add a new title</Link>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
