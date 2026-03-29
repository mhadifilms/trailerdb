import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useBrowseShard, useBrowseIndex } from '../lib/api'
import { useSearch } from '../lib/searchContext'
import { searchMovies } from '../lib/search'
import { posterUrl } from '../lib/utils'
import type { MovieIndex } from '../lib/types'
import { MovieCard } from '../components/MovieCard'
import { HorizontalScroll } from '../components/HorizontalScroll'
import { SEOHead } from '../components/SEOHead'

// Extracted directly from Figma node 3:3 (posters layer).
// Container: 1568x1287 at offset (-72, -35) on a 1440x1024 viewport.
// Converted: left% = (figmaLeft - 72.29) / 1440 * 100, top% = (figmaTop - 35) / 1024 * 100
const DESKTOP_POSTERS = [
  // Top-left cluster
  { top: 4, left: 2, rotate: 13, w: 102 },     // node 3:22 — small, top-left corner
  { top: -3, left: 13, rotate: -13, w: 148 },   // node 3:9 — medium, tilted
  { top: 19, left: -5, rotate: 22, w: 135 },    // node 3:28 — left edge
  // Top-center-left
  { top: 12, left: 26, rotate: -4, w: 151 },    // node 3:11 — near top
  { top: 6, left: 46, rotate: -3, w: 112 },     // node 3:10 — top center area
  // Top-right cluster
  { top: -3, left: 71, rotate: -10, w: 128 },   // node 3:8
  { top: 13, left: 58, rotate: -10, w: 151 },   // node 3:7
  { top: 5, left: 85, rotate: -13, w: 97 },     // node 3:23
  { top: 19, left: 90, rotate: -9, w: 152 },    // node 3:6
  // Left side
  { top: 28, left: 10, rotate: 8, w: 135 },     // node 3:4
  { top: 46, left: -1, rotate: 7, w: 123 },     // node 3:12
  { top: 38, left: 23, rotate: -14, w: 76 },    // node 3:15
  // Right side
  { top: 32, left: 77, rotate: -9, w: 127 },    // node 3:5
  { top: 37, left: 69, rotate: 9, w: 64 },      // node 3:16
  { top: 46, left: 91, rotate: -3, w: 111 },    // node 3:13
  // Bottom-left
  { top: 64, left: 10, rotate: -19, w: 141 },   // node 3:18
  { top: 77, left: -2, rotate: -13, w: 163 },   // node 3:24
  { top: 94, left: 15, rotate: -15, w: 196 },   // node 3:19 — large
  // Bottom-center (spread wide, not overlapping center)
  { top: 75, left: 33, rotate: -8, w: 136 },    // node 3:25
  { top: 92, left: 48, rotate: -3, w: 174 },    // node 3:26 — large
  // Bottom-right
  { top: 62, left: 78, rotate: -5, w: 128 },    // node 3:20
  { top: 67, left: 91, rotate: -13, w: 84 },    // node 3:14
  { top: 87, left: 73, rotate: -15, w: 173 },   // node 3:21 — large
  { top: 82, left: 91, rotate: -17, w: 176 },   // node 3:27 — large
  { top: 94, left: 95, rotate: -24, w: 111 },   // node 3:17
]

// Mobile: tiny posters, far corners only, no overlap possible
const MOBILE_POSTERS = [
  { top: 2, left: -4, rotate: 12, w: 45 },
  { top: 1, left: 82, rotate: -10, w: 40 },
  { top: 75, left: -2, rotate: -8, w: 45 },
  { top: 73, left: 84, rotate: -12, w: 40 },
]

function ScatteredPosters({ movies }: { movies: MovieIndex[] }) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [scroll, setScroll] = useState(0)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const { isOpen: searchOpen } = useSearch()
  const navigate = useNavigate()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check, { passive: true })
    return () => window.removeEventListener('resize', check)
  }, [])

  const positions = isMobile ? MOBILE_POSTERS : DESKTOP_POSTERS

  const posters = useMemo(() => {
    return positions.map((pos, i) => {
      const movie = movies[i % movies.length]
      if (!movie) return null
      const src = posterUrl(movie.poster, isMobile ? 'w185' : 'w342')
      if (!src) return null
      return { ...pos, src, title: movie.title, slug: movie.slug, key: i }
    }).filter(Boolean) as (typeof DESKTOP_POSTERS[number] & { src: string; title: string; slug: string; key: number })[]
  }, [movies, positions, isMobile])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const onScroll = () => setScroll(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollProg = Math.min(scroll / (window.innerHeight * 0.7), 1)

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ width: '110%', left: '-5%' }}>
      {posters.map((p, idx) => {
        const depth = 0.4 + (p.w / 200) * 0.6

        // Parallax from mouse
        const px = mouse.x * 25 * depth * (idx % 2 === 0 ? 1 : -0.8)
        const py = mouse.y * 18 * depth

        // Push outward when search opens
        const pushX = ((p.left - 50) / 50) * (searchOpen ? 45 : 0)
        const pushY = ((p.top - 45) / 50) * (searchOpen ? 30 : 0)

        // Scroll collapse upward toward center
        const sY = -scrollProg * 180 * depth
        const sX = scrollProg * (50 - p.left) * 0.25
        const sScale = 1 - scrollProg * 0.25

        // Hover
        const isHovered = hoveredIdx === idx
        const hScale = isHovered ? 1.15 : 1

        // Opacity: visible at rest, full on hover, dim on search/scroll
        const baseOpacity = searchOpen ? 0.12 : 0.35
        const opacity = isHovered ? 1 : baseOpacity * (1 - scrollProg * 0.7)

        return (
          <div
            key={p.key}
            className="absolute cursor-pointer"
            style={{
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: p.w,
              transform: `translate(${px + pushX + sX}px, ${py + pushY + sY}px) rotate(${p.rotate}deg) scale(${sScale * hScale})`,
              opacity: Math.max(opacity, 0),
              transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease',
              zIndex: isHovered ? 20 : 1,
            }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => navigate(`/movie/${p.slug}`)}
          >
            <img
              src={p.src}
              alt={p.title}
              className={`w-full rounded-[20px] object-cover aspect-[2/3] transition-shadow duration-300 ${isHovered ? 'shadow-2xl' : 'shadow-md'}`}
              loading="lazy"
              draggable={false}
            />
            {isHovered && (
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-body text-text-primary shadow-sm">
                {p.title}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full text-xs font-body transition-colors cursor-pointer ${
      active
        ? 'bg-[#383838] text-white'
        : 'bg-[#f0f0f0] text-[#383838] hover:bg-[#e5e5e5]'
    }`}>
      {label}
    </button>
  )
}

/** In-place expanding search bar — matches Figma design exactly */
function HeroSearch() {
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { data } = useBrowseIndex()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { open: openSearch, close: closeSearch, isOpen, prefill, clearPrefill } = useSearch()
  const [showFilters, setShowFilters] = useState(false)

  const results = data ? searchMovies(data.movies, deferredQuery, 10) : []
  const showResults = focused && deferredQuery.length >= 2

  // Click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
        closeSearch()
      }
    }
    if (focused) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [focused, closeSearch])

  // Handle open + prefill from search context
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setFocused(true)
    }
  }, [isOpen])

  useEffect(() => {
    if (prefill) {
      setQuery(prefill)
      clearPrefill()
      setFocused(true)
      inputRef.current?.focus()
    }
  }, [prefill, clearPrefill])

  const handleFocus = () => { setFocused(true); openSearch() }
  const goTo = (movie: MovieIndex) => { navigate(`/movie/${movie.slug}`); setFocused(false); setQuery(''); closeSearch() }

  return (
    <div ref={containerRef} className="w-full max-w-[639px] relative z-30">
      <div
        className={`bg-[#fffefe] rounded-[55px] shadow-[1px_1px_20px_-10px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 ${
          showResults ? 'rounded-[30px]' : ''
        }`}
      >
        {/* Input bar — always 56px */}
        <div className="h-14 flex items-center px-10 gap-3">
          <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {focused ? (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) goTo(results[0])
                if (e.key === 'Escape') { setFocused(false); setQuery(''); closeSearch() }
              }}
              placeholder="Search for cinema"
              className="flex-1 bg-transparent text-xl font-display text-[#383838] tracking-[-0.02em] placeholder:text-text-muted outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <button
              onClick={handleFocus}
              className="flex-1 text-left text-xl font-display text-text-muted tracking-[-0.02em] cursor-text"
            >
              Search for cinema
            </button>
          )}
          {/* Filter button */}
          <button
            onClick={() => { handleFocus(); setShowFilters(!showFilters) }}
            className={`shrink-0 cursor-pointer p-1 rounded-full transition-colors ${showFilters ? 'text-[#383838]' : 'text-text-muted hover:text-[#383838]'}`}
            aria-label="Toggle filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
          </button>
        </div>

        {/* Advanced filter panel */}
        {focused && showFilters && (
          <div className="px-10 pb-4 space-y-3">
            {/* Content type */}
            <div>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-wider mb-1.5">Type</p>
              <div className="flex gap-1.5 flex-wrap">
                <FilterPill label="All" active />
                <FilterPill label="Movies" />
                <FilterPill label="TV Series" />
              </div>
            </div>
            {/* Genre */}
            <div>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-wider mb-1.5">Genre</p>
              <div className="flex gap-1.5 flex-wrap">
                {['All', 'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Romance', 'Animation'].map((g) => (
                  <FilterPill key={g} label={g} active={g === 'All'} />
                ))}
              </div>
            </div>
            {/* Decade */}
            <div>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-wider mb-1.5">Decade</p>
              <div className="flex gap-1.5 flex-wrap">
                {['All', '2020s', '2010s', '2000s', '1990s', '1980s'].map((d) => (
                  <FilterPill key={d} label={d} active={d === 'All'} />
                ))}
              </div>
            </div>
            {/* Rating */}
            <div>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-wider mb-1.5">Min Rating</p>
              <div className="flex gap-1.5 flex-wrap">
                {['Any', '6+', '7+', '8+', '9+'].map((r) => (
                  <FilterPill key={r} label={r} active={r === 'Any'} />
                ))}
              </div>
            </div>
            {/* Language */}
            <div>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-wider mb-1.5">Trailer Language</p>
              <div className="flex gap-1.5 flex-wrap">
                {['All', 'English', 'French', 'German', 'Spanish', 'Japanese', 'Korean', 'Italian', 'Russian'].map((l) => (
                  <FilterPill key={l} label={l} active={l === 'All'} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Expanded results — grows from the search bar */}
        {showResults && results.length > 0 && (
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
                    <Link to={`/search?q=${encodeURIComponent(query)}`} onClick={() => { setFocused(false); closeSearch() }} className="shrink-0 flex flex-col items-center gap-1 mt-10 text-[#383838] hover:text-text-muted transition-colors">
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
                  <Link to="/movie/not-found" onClick={() => { setFocused(false); closeSearch() }} className="text-[#383838] underline hover:text-text-muted transition-colors">
                    add a new title
                  </Link>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No results */}
        {showResults && results.length === 0 && data && (
          <div>
            <div className="mx-10 border-t border-[#e5e5e5]" />
            <div className="px-10 py-6 text-center">
              <p className="text-text-muted text-sm font-body mb-2">No results for "{deferredQuery}"</p>
              <Link to="/movie/not-found" onClick={() => { setFocused(false); closeSearch() }} className="font-display text-xs text-[#383838] underline">
                add a new title
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function HeroSection({ trendingMovies }: { trendingMovies: MovieIndex[] }) {
  const { open: openSearch } = useSearch()

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <ScatteredPosters movies={trendingMovies} />

      {/* Top-down gradient: 100% white at top → transparent at bottom (matches Figma node 3:29) */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/60 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-[639px] w-full flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
        >
          <p className="font-display text-lg sm:text-2xl text-black tracking-[-0.02em]">THE</p>
          <h1 className="font-display text-[40px] sm:text-[56px] md:text-[72px] lg:text-[80px] text-black tracking-[-0.02em] leading-[0.85] -mt-1">
            Trailer Database
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-4 sm:mt-5 text-base sm:text-xl text-black font-body tracking-[-0.02em] leading-relaxed px-2"
        >
          A collection of 300,000+ <em className="font-medium">trailers</em>,{' '}
          <em className="font-medium">clips</em>, and{' '}
          <em className="font-medium">behind-the-scenes</em> from films & TV shows, in over 20+ languages
        </motion.p>

        {/* In-place search bar that expands with results */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-8 w-full"
        >
          <HeroSearch />
        </motion.div>

        {/* Search hints */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-4 text-text-muted text-base font-body font-light tracking-[-0.02em]"
        >
          try searching:{' '}
          <button onClick={() => openSearch('Project Hail Mary')} className="italic underline hover:text-text-secondary transition-colors cursor-pointer">
            Project Hail Mary
          </button>
          {' '}or{' '}
          <button onClick={() => openSearch('Pluribus')} className="italic underline hover:text-text-secondary transition-colors cursor-pointer">
            Pluribus
          </button>
        </motion.p>
      </div>
    </section>
  )
}

function MovieRow({ title, shardPath, viewAllLink }: { title: string; shardPath: string; viewAllLink?: string }) {
  const { data: movies, isLoading } = useBrowseShard(shardPath)

  return (
    <section className="mb-16">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-text-primary text-2xl md:text-3xl">{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-text-muted text-sm font-body font-medium hover:text-text-primary transition-colors">
            View All →
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : (
        <HorizontalScroll>
          {movies?.slice(0, 20).map((movie, i) => (
            <div key={movie.imdb_id} className="shrink-0 w-[160px] md:w-[185px] snap-start">
              <MovieCard movie={movie} index={i} />
            </div>
          ))}
        </HorizontalScroll>
      )}
    </section>
  )
}

export function Home() {
  const { data: trending } = useBrowseShard('trending.json')

  return (
    <>
      <SEOHead />
      <HeroSection trendingMovies={trending || []} />

      <div className="max-w-7xl mx-auto px-4 py-16">
        <MovieRow title="Trending" shardPath="trending.json" viewAllLink="/browse?sort=trending" />
        <MovieRow title="Top Rated" shardPath="top-rated.json" viewAllLink="/browse?sort=rating" />
        <MovieRow title="Most Trailers" shardPath="most-trailers.json" />
        <MovieRow title="Recent Releases" shardPath="recent.json" viewAllLink="/browse?sort=year" />
      </div>
    </>
  )
}
