import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSearch } from '../lib/searchContext'
import { SearchOverlay } from './SearchOverlay'
import { getWatchlist } from '../lib/storage'

const NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'Movies', to: '/browse' },
  { label: 'Series', to: '/series' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Developer', to: '/api-docs' },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [watchlistCount, setWatchlistCount] = useState(0)
  const { open: openSearch } = useSearch()
  const location = useLocation()
  const isHome = location.pathname === '/'

  // On home page: open the in-place HeroSearch via context
  // On other pages: open the SearchOverlay modal
  const triggerSearch = useCallback((query?: string) => {
    if (isHome) {
      openSearch(query)
    } else {
      setOverlayOpen(true)
    }
  }, [isHome, openSearch])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false); setOverlayOpen(false) }, [location])

  // Update watchlist count on route change and on storage events
  useEffect(() => {
    setWatchlistCount(getWatchlist().length)
  }, [location])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tdb_watchlist') {
        setWatchlistCount(getWatchlist().length)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        triggerSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triggerSearch])

  const bgClass = scrolled
    ? 'bg-white/95 backdrop-blur-md border-b border-border shadow-sm'
    : 'bg-transparent'

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 h-[70px] transition-all duration-300 ${bgClass}`}>
        <div className="max-w-7xl mx-auto px-4 h-full flex items-end justify-center pb-3">
          {/* Desktop nav */}
          <nav className="hidden md:flex items-end gap-0" aria-label="Main navigation">
            {NAV_ITEMS.map((item, i) => (
              <div key={item.label} className="flex items-end">
                {i > 0 && (
                  <span className="text-black text-base font-display mx-4 mb-[1px]">|</span>
                )}
                <Link
                  to={item.to}
                  className="font-display text-2xl text-black hover:text-text-muted transition-colors tracking-[-0.02em]"
                >
                  {item.label}
                </Link>
              </div>
            ))}
            <span className="text-black text-base font-display mx-4 mb-[1px]">|</span>
            {/* Watchlist icon */}
            <Link
              to="/watchlist"
              className="relative text-black hover:text-text-muted transition-colors mb-[2px] mr-3"
              aria-label="Watchlist"
              title="Watchlist"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              {watchlistCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-crimson text-white text-[10px] font-body font-bold leading-none px-1">
                  {watchlistCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => triggerSearch()}
              className="text-black hover:text-text-muted transition-colors cursor-pointer mb-[2px]"
              aria-label="Search"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </button>
          </nav>

          {/* Mobile */}
          <div className="flex md:hidden items-center justify-between w-full">
            <Link to="/" className="font-display text-xl text-black tracking-[-0.02em]">
              Trailer Database
            </Link>
            <div className="flex items-center gap-2">
              {/* Watchlist icon (mobile) */}
              <Link
                to="/watchlist"
                className="relative p-2 text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Watchlist"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                {watchlistCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-crimson text-white text-[10px] font-body font-bold leading-none px-1">
                    {watchlistCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => triggerSearch()}
                className="p-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                aria-label="Search"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </button>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-nav" className="md:hidden bg-white/95 backdrop-blur-md border-b border-border px-4 py-4 space-y-3" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <Link key={item.label} to={item.to} className="block font-display text-lg text-black hover:text-text-muted">
                {item.label}
              </Link>
            ))}
            <Link to="/watchlist" className="block font-display text-lg text-black hover:text-text-muted">
              Watchlist {watchlistCount > 0 && <span className="text-text-muted text-sm">({watchlistCount})</span>}
            </Link>
            <Link to="/history" className="block font-display text-lg text-black hover:text-text-muted">
              History
            </Link>
          </nav>
        )}
      </header>

      {/* Search overlay for non-home pages */}
      <SearchOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  )
}
