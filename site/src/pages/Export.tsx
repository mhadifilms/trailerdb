import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { SEOHead } from '../components/SEOHead'
import { CodeBlock } from '../components/CodeBlock'
import { useBrowseIndex } from '../lib/api'
import type { MovieIndex, MovieDetail } from '../lib/types'

const GENRE_OPTIONS = [
  { slug: 'action', name: 'Action', id: 28 },
  { slug: 'adventure', name: 'Adventure', id: 12 },
  { slug: 'animation', name: 'Animation', id: 16 },
  { slug: 'comedy', name: 'Comedy', id: 35 },
  { slug: 'crime', name: 'Crime', id: 80 },
  { slug: 'documentary', name: 'Documentary', id: 99 },
  { slug: 'drama', name: 'Drama', id: 18 },
  { slug: 'family', name: 'Family', id: 10751 },
  { slug: 'fantasy', name: 'Fantasy', id: 14 },
  { slug: 'history', name: 'History', id: 36 },
  { slug: 'horror', name: 'Horror', id: 27 },
  { slug: 'music', name: 'Music', id: 10402 },
  { slug: 'mystery', name: 'Mystery', id: 9648 },
  { slug: 'romance', name: 'Romance', id: 10749 },
  { slug: 'science-fiction', name: 'Science Fiction', id: 878 },
  { slug: 'thriller', name: 'Thriller', id: 53 },
  { slug: 'tv-movie', name: 'TV Movie', id: 10770 },
  { slug: 'war', name: 'War', id: 10752 },
  { slug: 'western', name: 'Western', id: 37 },
]

const MIN_YEAR = 1920
const MAX_YEAR = 2026
const SMALL_BATCH_LIMIT = 50

export function Export() {
  const { data: index, isLoading } = useBrowseIndex()

  // Filter state
  const [genre, setGenre] = useState<number | null>(null)
  const [yearFrom, setYearFrom] = useState(2000)
  const [yearTo, setYearTo] = useState(MAX_YEAR)
  const [minRating, setMinRating] = useState(0)
  const [minVotes, setMinVotes] = useState(0)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [manifestProgress, setManifestProgress] = useState<string | null>(null)

  // Apply filters to index
  const filtered = useMemo(() => {
    if (!index) return []
    return index.movies.filter(m => {
      if (genre && !m.genre_ids.includes(genre)) return false
      if (m.year != null && (m.year < yearFrom || m.year > yearTo)) return false
      if (m.year == null) return false
      if (minRating > 0 && (m.rating == null || m.rating < minRating)) return false
      if (minVotes > 0 && (m.votes == null || m.votes < minVotes)) return false
      return true
    })
  }, [index, genre, yearFrom, yearTo, minRating, minVotes])

  const totalTrailers = useMemo(
    () => filtered.reduce((sum, m) => sum + m.trailer_count, 0),
    [filtered]
  )

  const isSmallBatch = filtered.length <= SMALL_BATCH_LIMIT && filtered.length > 0

  // Build CLI command string from current filters
  const cliCommand = useMemo(() => {
    const parts: string[] = []
    const genreObj = genre ? GENRE_OPTIONS.find(g => g.id === genre) : null
    if (genreObj) parts.push(`genre=${genreObj.slug}`)
    if (yearFrom > MIN_YEAR) parts.push(`year>=${yearFrom}`)
    if (yearTo < MAX_YEAR) parts.push(`year<=${yearTo}`)
    if (minRating > 0) parts.push(`rating>=${minRating}`)
    if (minVotes > 0) parts.push(`votes>=${minVotes}`)
    const filter = parts.length > 0 ? `"${parts.join(' ')}"` : '"all"'
    return `trailerdb batch ${filter} --output manifest.txt`
  }, [genre, yearFrom, yearTo, minRating, minVotes])

  // Download CSV of filtered results
  const handleDownloadCSV = useCallback(() => {
    if (filtered.length === 0) return
    const headers = ['imdb_id', 'title', 'year', 'rating', 'votes', 'trailer_count', 'popularity']
    const rows = filtered.map(m => [
      m.imdb_id,
      `"${(m.title || '').replace(/"/g, '""')}"`,
      m.year ?? '',
      m.rating ?? '',
      m.votes ?? '',
      m.trailer_count,
      m.popularity,
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(csv, 'trailerdb-export.csv', 'text/csv')
  }, [filtered])

  // Generate yt-dlp manifest (client-side for small batches)
  const handleGenerateManifest = useCallback(async () => {
    if (!isSmallBatch) return
    setExporting(true)
    setManifestProgress('Fetching trailer data...')

    try {
      const BASE = import.meta.env.BASE_URL + 'data'
      const urls: string[] = []
      let done = 0

      // Fetch in batches of 10
      for (let i = 0; i < filtered.length; i += 10) {
        const batch = filtered.slice(i, i + 10)
        const results = await Promise.allSettled(
          batch.map(m =>
            fetch(`${BASE}/movie/${m.imdb_id}.json`)
              .then(r => {
                if (!r.ok) throw new Error(`${r.status}`)
                return r.json() as Promise<MovieDetail>
              })
          )
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            for (const t of result.value.trailers) {
              urls.push(`https://www.youtube.com/watch?v=${t.youtube_id}`)
            }
          }
        }
        done += batch.length
        setManifestProgress(`Fetched ${done} of ${filtered.length} movies...`)
      }

      if (urls.length === 0) {
        setManifestProgress('No trailer URLs found.')
        setTimeout(() => setManifestProgress(null), 3000)
        return
      }

      downloadFile(urls.join('\n'), 'trailerdb-manifest.txt', 'text/plain')
      setManifestProgress(`Done! ${urls.length} URLs exported.`)
      setTimeout(() => setManifestProgress(null), 3000)
    } catch (err) {
      setManifestProgress('Error generating manifest. Try the CLI instead.')
      setTimeout(() => setManifestProgress(null), 4000)
    } finally {
      setExporting(false)
    }
  }, [filtered, isSmallBatch])

  return (
    <>
      <SEOHead
        title="Export"
        description="Export The Trailer Database data. Generate yt-dlp manifests, download CSV files, and bulk-download trailer data."
      />

      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl mb-4">
            Bulk <span className="text-accent">Export</span>
          </h1>
          <p className="text-lg text-text-secondary font-body leading-relaxed">
            Filter The Trailer Database catalog and export matching movies as CSV or generate
            a yt-dlp manifest for batch downloading trailers.
          </p>
        </div>

        {/* Filter controls */}
        <div className="p-6 rounded-xl bg-bg-surface border border-border mb-8">
          <h2 className="font-display text-text-primary text-xl mb-5">Filters</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Genre */}
            <div>
              <label className="block text-xs font-body uppercase tracking-wider text-text-muted mb-2">Genre</label>
              <select
                value={genre ?? ''}
                onChange={e => setGenre(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg bg-bg-overlay border border-border text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">All genres</option>
                {GENRE_OPTIONS.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Year from */}
            <div>
              <label className="block text-xs font-body uppercase tracking-wider text-text-muted mb-2">Year from</label>
              <input
                type="number"
                min={MIN_YEAR}
                max={yearTo}
                value={yearFrom}
                onChange={e => setYearFrom(Math.max(MIN_YEAR, Math.min(yearTo, Number(e.target.value))))}
                className="w-full px-3 py-2 rounded-lg bg-bg-overlay border border-border text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Year to */}
            <div>
              <label className="block text-xs font-body uppercase tracking-wider text-text-muted mb-2">Year to</label>
              <input
                type="number"
                min={yearFrom}
                max={MAX_YEAR}
                value={yearTo}
                onChange={e => setYearTo(Math.max(yearFrom, Math.min(MAX_YEAR, Number(e.target.value))))}
                className="w-full px-3 py-2 rounded-lg bg-bg-overlay border border-border text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Min rating */}
            <div>
              <label className="block text-xs font-body uppercase tracking-wider text-text-muted mb-2">
                Min rating: {minRating > 0 ? minRating.toFixed(1) : 'Any'}
              </label>
              <input
                type="range"
                min={0}
                max={9}
                step={0.5}
                value={minRating}
                onChange={e => setMinRating(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            {/* Min votes */}
            <div>
              <label className="block text-xs font-body uppercase tracking-wider text-text-muted mb-2">
                Min votes: {minVotes > 0 ? minVotes.toLocaleString() : 'Any'}
              </label>
              <select
                value={minVotes}
                onChange={e => setMinVotes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-bg-overlay border border-border text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
              >
                <option value={0}>Any</option>
                <option value={100}>100+</option>
                <option value={1000}>1,000+</option>
                <option value={10000}>10,000+</option>
                <option value={50000}>50,000+</option>
                <option value={100000}>100,000+</option>
              </select>
            </div>
          </div>
        </div>

        {/* Preview stats */}
        <div className="p-6 rounded-xl bg-bg-surface border border-border mb-8">
          <h2 className="font-display text-text-primary text-xl mb-4">Preview</h2>
          {isLoading ? (
            <div className="flex items-center gap-3 text-text-muted font-body text-sm">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Loading index...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatBox value={filtered.length.toLocaleString()} label="Movies" />
              <StatBox value={totalTrailers.toLocaleString()} label="Trailers" />
              <StatBox
                value={filtered.length > 0
                  ? (filtered.reduce((s, m) => s + (m.rating ?? 0), 0) / filtered.filter(m => m.rating != null).length || 0).toFixed(1)
                  : '--'}
                label="Avg rating"
              />
              <StatBox
                value={filtered.length > 0
                  ? `${Math.min(...filtered.filter(m => m.year != null).map(m => m.year!))}–${Math.max(...filtered.filter(m => m.year != null).map(m => m.year!))}`
                  : '--'}
                label="Year range"
              />
            </div>
          )}
        </div>

        {/* Export actions */}
        <div className="p-6 rounded-xl bg-bg-surface border border-border mb-8">
          <h2 className="font-display text-text-primary text-xl mb-5">Export</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* CSV download */}
            <button
              onClick={handleDownloadCSV}
              disabled={filtered.length === 0 || isLoading}
              className="flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-accent text-bg-base font-body font-medium text-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download CSV
            </button>

            {/* yt-dlp manifest */}
            <button
              onClick={isSmallBatch ? handleGenerateManifest : undefined}
              disabled={filtered.length === 0 || isLoading || exporting || !isSmallBatch}
              className="flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-bg-overlay border border-border text-text-primary font-body font-medium text-sm hover:bg-bg-hover hover:border-border-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125" />
              </svg>
              {exporting ? 'Generating...' : 'Generate yt-dlp Manifest'}
            </button>
          </div>

          {/* Progress / status */}
          {manifestProgress && (
            <div className="px-4 py-2 rounded-lg bg-bg-overlay text-sm font-body text-text-secondary mb-4">
              {manifestProgress}
            </div>
          )}

          {/* Large batch notice */}
          {!isSmallBatch && filtered.length > 0 && (
            <div className="px-4 py-3 rounded-lg bg-bg-overlay border border-border">
              <p className="text-sm text-text-secondary font-body mb-3">
                <span className="text-accent font-medium">{filtered.length.toLocaleString()} movies</span> is too many to
                fetch individually in the browser. Use the CLI tool to generate a full manifest:
              </p>
              <CodeBlock
                language="bash"
                code={`pip install trailerdb\n${cliCommand}\n\n# Then download with yt-dlp\nyt-dlp -a manifest.txt`}
              />
            </div>
          )}

          {/* Small batch info */}
          {isSmallBatch && (
            <p className="text-xs text-text-muted font-body">
              {filtered.length} movies selected — small enough to generate the manifest directly in your browser.
              The manifest will contain one YouTube URL per line, compatible with yt-dlp.
            </p>
          )}
        </div>

        {/* Bulk download links */}
        <div className="p-6 rounded-xl bg-bg-surface border border-border">
          <h2 className="font-display text-text-primary text-xl mb-4">Full Database Downloads</h2>
          <p className="text-sm text-text-secondary font-body mb-5">
            Need the entire dataset? Download the full database instead of filtering by individual movies.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BulkLink
              label="Static JSON API (Live)"
              href="/data/stats.json"
            />
            <BulkLink
              label="Browse All Movie JSON Files"
              href="/api-docs#endpoints"
              internal
            />
            <BulkLink
              label="SQLite & CSV Downloads (Coming Soon)"
              href="#"
              disabled
            />
            <BulkLink
              label="HuggingFace & Kaggle (Coming Soon)"
              href="#"
              disabled
            />
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <Link
              to="/api-docs"
              className="inline-flex items-center gap-2 text-sm font-body text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              View full API documentation
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-bg-overlay">
      <div className="font-display text-accent text-xl">{value}</div>
      <div className="text-text-muted text-xs uppercase tracking-wider mt-1 font-body">{label}</div>
    </div>
  )
}

function BulkLink({ label, href, disabled, internal }: { label: string; href: string; disabled?: boolean; internal?: boolean }) {
  if (disabled) {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-bg-overlay border border-border opacity-50">
        <span className="text-sm font-body text-text-muted">{label}</span>
      </div>
    )
  }
  if (internal) {
    return (
      <Link
        to={href}
        className="flex items-center justify-between px-4 py-3 rounded-lg bg-bg-overlay hover:bg-bg-hover border border-border hover:border-border-hover transition-all group"
      >
        <span className="text-sm font-body text-text-primary group-hover:text-accent transition-colors">{label}</span>
        <svg className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-4 py-3 rounded-lg bg-bg-overlay hover:bg-bg-hover border border-border hover:border-border-hover transition-all group"
    >
      <span className="text-sm font-body text-text-primary group-hover:text-accent transition-colors">{label}</span>
      <svg className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  )
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
