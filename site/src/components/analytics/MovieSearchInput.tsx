import { useState, useRef, useEffect, useCallback } from 'react'
import { useBrowseIndex } from '../../lib/api'

interface MovieSearchInputProps {
  onSelect: (imdbId: string, title: string) => void
  placeholder?: string
  value?: string
  className?: string
}

interface Suggestion {
  imdb_id: string
  title: string
  year: number | null
}

export function MovieSearchInput({
  onSelect,
  placeholder = 'Search movies...',
  value = '',
  className = '',
}: MovieSearchInputProps) {
  const [query, setQuery] = useState(value)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: browseData } = useBrowseIndex()

  // Update internal query when value prop changes
  useEffect(() => {
    setQuery(value)
  }, [value])

  const suggestions: Suggestion[] = useCallback(() => {
    if (!browseData || query.length < 2) return []
    const q = query.toLowerCase()
    const matches: Suggestion[] = []
    for (const m of browseData.movies) {
      if (matches.length >= 8) break
      if (m.title.toLowerCase().includes(q)) {
        matches.push({ imdb_id: m.imdb_id, title: m.title, year: m.year })
      }
    }
    return matches
  }, [browseData, query])()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && selectedIdx >= 0 && suggestions[selectedIdx]) {
      e.preventDefault()
      const s = suggestions[selectedIdx]!
      setQuery(s.title)
      setShowSuggestions(false)
      onSelect(s.imdb_id, s.title)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  function handleSelect(s: Suggestion) {
    setQuery(s.title)
    setShowSuggestions(false)
    onSelect(s.imdb_id, s.title)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setShowSuggestions(true)
          setSelectedIdx(-1)
        }}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted/50 transition-colors"
        autoComplete="off"
      />
      {/* Search icon */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-base border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.imdb_id}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full text-left px-3 py-2 text-sm font-body flex items-baseline gap-2 cursor-pointer transition-colors ${
                i === selectedIdx ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:bg-bg-surface'
              }`}
            >
              <span className="truncate font-medium">{s.title}</span>
              {s.year && (
                <span className="text-text-muted text-xs tabular-nums shrink-0">
                  ({s.year})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
