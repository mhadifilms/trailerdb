import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { SEOHead } from '../components/SEOHead'
import { CodeBlock } from '../components/CodeBlock'

// Table of contents sections
const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'movie-detail', label: 'Movie Detail' },
  { id: 'full-index', label: 'Full Index' },
  { id: 'browse-shards', label: 'Browse Shards' },
  { id: 'stats', label: 'Stats' },
  { id: 'usage', label: 'Usage Examples' },
  { id: 'data-format', label: 'Data Format' },
  { id: 'downloads', label: 'Downloads & Export' },
] as const

function EndpointBadge({ method }: { method: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-rating-green/15 text-rating-green uppercase tracking-wider">
      {method}
    </span>
  )
}

function EndpointUrl({ url }: { url: string }) {
  return (
    <code className="text-sm font-mono text-accent break-all">{url}</code>
  )
}

function FieldRow({ name, type, description }: { name: string; type: string; description: string }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-4 font-mono text-sm text-accent whitespace-nowrap">{name}</td>
      <td className="py-2 pr-4 font-mono text-xs text-type-teaser whitespace-nowrap">{type}</td>
      <td className="py-2 text-sm text-text-secondary">{description}</td>
    </tr>
  )
}

const BASE = typeof window !== 'undefined' ? window.location.origin : 'https://trailerdb.com'

export function API() {
  const [activeSection, setActiveSection] = useState('overview')

  // Intersection observer for sticky TOC highlighting
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const sections = TOC.map(t => document.getElementById(t.id)).filter(Boolean)

    sections.forEach(section => {
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        },
        { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
      )
      if (section) obs.observe(section)
      observers.push(obs)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  return (
    <>
      <SEOHead
        title="API Documentation"
        description="The Trailer Database API documentation. Free, open access to movie trailer data via static JSON files. No authentication, no rate limits."
      />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <div className="max-w-3xl mb-12">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl mb-4">
            API <span className="text-accent">Documentation</span>
          </h1>
          <p className="text-lg text-text-secondary font-body leading-relaxed">
            Everything you need to build with The Trailer Database data. Free and open, no strings attached.
          </p>
        </div>

        {/* Layout: sidebar + content */}
        <div className="flex gap-10">
          {/* Sticky sidebar TOC — desktop only */}
          <aside className="hidden lg:block w-52 shrink-0">
            <nav className="sticky top-24" aria-label="Table of contents">
              <div className="text-xs font-body uppercase tracking-wider text-text-muted mb-3">
                On this page
              </div>
              <ul className="space-y-1 border-l border-border">
                {TOC.map(item => (
                  <li key={item.id}>
                    <button
                      onClick={() => scrollTo(item.id)}
                      className={`block w-full text-left pl-4 py-1.5 text-sm font-body transition-colors cursor-pointer ${
                        activeSection === item.id
                          ? 'text-accent border-l-2 border-accent -ml-px'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1 max-w-3xl space-y-16">

            {/* ── Overview ─────────────────────────────────── */}
            <section id="overview">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-4">Overview</h2>
              <div className="space-y-4 text-text-secondary font-body leading-relaxed">
                <p>
                  The Trailer Database provides free, open access to movie trailer data. All data is served as
                  static JSON files — no authentication required, no rate limits, no API keys.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-lg bg-bg-surface border border-border text-center">
                    <div className="font-display text-accent text-xl mb-1">Static JSON</div>
                    <div className="text-xs text-text-muted">CDN-served files</div>
                  </div>
                  <div className="p-4 rounded-lg bg-bg-surface border border-border text-center">
                    <div className="font-display text-accent text-xl mb-1">No Auth</div>
                    <div className="text-xs text-text-muted">Zero configuration</div>
                  </div>
                  <div className="p-4 rounded-lg bg-bg-surface border border-border text-center">
                    <div className="font-display text-accent text-xl mb-1">No Limits</div>
                    <div className="text-xs text-text-muted">Unlimited requests</div>
                  </div>
                </div>
                <p className="text-sm text-text-muted">
                  Base URL: <code className="font-mono text-accent">{BASE}/data/</code>
                </p>
              </div>
            </section>

            {/* ── Endpoints ────────────────────────────────── */}
            <section id="endpoints">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Endpoints</h2>

              {/* Movie Detail */}
              <div id="movie-detail" className="mb-12">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/movie/{imdb_id}.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Returns full movie detail with all trailers for a given IMDb ID.
                </p>
                <div className="text-sm text-text-muted font-body mb-4">
                  Example: <code className="font-mono text-accent">/data/movie/tt0468569.json</code> (The Dark Knight)
                </div>
                <CodeBlock
                  language="json"
                  title="Response — movie detail"
                  code={`{
  "imdb_id": "tt0468569",
  "tmdb_id": 155,
  "title": "The Dark Knight",
  "original_title": "The Dark Knight",
  "year": 2008,
  "imdb_rating": 9.0,
  "imdb_votes": 2800000,
  "runtime": 152,
  "overview": "Batman raises the stakes in his war on crime...",
  "poster_path": "/qJ2tW6WMUDux911BTUgMe1YT.jpg",
  "backdrop_path": "/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg",
  "original_language": "en",
  "genres": ["Action", "Crime", "Drama", "Thriller"],
  "slug": "the-dark-knight-2008-tt0468569",
  "trailers": [
    {
      "youtube_id": "EXeTwQWrcwY",
      "title": "The Dark Knight - Official Trailer",
      "type": "trailer",
      "language": "en",
      "region": "US",
      "is_official": true,
      "published_at": "2007-12-15",
      "quality": 1080,
      "channel_name": "Warner Bros. Pictures",
      "duration": 150,
      "views": 45000000
    }
  ]
}`}
                />
              </div>

              {/* Full Index */}
              <div id="full-index" className="mb-12">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/index.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Full browse index — a compact array-of-arrays format containing all 100K+ movies.
                  This is approximately 14MB, so cache it aggressively.
                </p>
                <div className="p-4 rounded-lg bg-bg-surface border border-border mb-4">
                  <div className="text-xs font-body uppercase tracking-wider text-text-muted mb-3">Field order (per row)</div>
                  <div className="flex flex-wrap gap-2">
                    {['imdb_id', 'title', 'year', 'rating', 'votes', 'poster', 'genre_ids', 'tmdb_id', 'slug', 'trailer_count', 'popularity'].map((f, i) => (
                      <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-bg-overlay text-xs font-mono">
                        <span className="text-text-muted">{i}</span>
                        <span className="text-accent">{f}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <CodeBlock
                  language="json"
                  title="Response — index.json (truncated)"
                  code={`{
  "movies": [
    ["tt0468569", "The Dark Knight", 2008, 9.0, 2800000, "/qJ2tW...", [28, 80, 18, 53], 155, "the-dark-knight-2008-tt0468569", 5, 89.2],
    ["tt1375666", "Inception", 2010, 8.8, 2400000, "/oYuLEt...", [28, 878, 53], 27205, "inception-2010-tt1375666", 4, 76.5]
  ],
  "fields": ["imdb_id", "title", "year", "rating", "votes", "poster", "genre_ids", "tmdb_id", "slug", "trailer_count", "popularity"],
  "genres": {"28": "Action", "12": "Adventure", "16": "Animation", "35": "Comedy", "80": "Crime"}
}`}
                />
              </div>

              {/* Browse Shards */}
              <div id="browse-shards" className="mb-12">
                <h3 className="font-display text-text-primary text-xl mb-4">Browse Shards</h3>
                <p className="text-text-secondary font-body mb-6">
                  Pre-computed browse lists — smaller, focused subsets of the index for common queries.
                  All return the same compact array-of-arrays format as the full index.
                </p>

                {/* Trending */}
                <div className="mb-8 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/trending.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 movies by TMDB popularity score. Updated daily.
                  </p>
                </div>

                {/* Top Rated */}
                <div className="mb-8 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/top-rated.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 movies by IMDb rating (minimum 10K votes).
                  </p>
                </div>

                {/* Genre */}
                <div className="mb-8 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/genre/{slug}.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm mb-3">
                    Top 200 movies in a genre, sorted by popularity.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary',
                      'drama', 'family', 'fantasy', 'history', 'horror', 'music', 'mystery',
                      'romance', 'science-fiction', 'thriller', 'tv-movie', 'war', 'western',
                    ].map(slug => (
                      <span key={slug} className="px-2 py-0.5 rounded bg-bg-overlay text-xs font-mono text-text-muted">
                        {slug}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Year */}
                <div className="mb-8 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/year/{year}.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    All movies with trailers from a given year. Available range: 1920 to 2026.
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div id="stats" className="mb-12">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/stats.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Database-wide statistics: total movies, trailers, languages, and breakdowns by type and language.
                </p>
                <CodeBlock
                  language="json"
                  title="Response — stats.json"
                  code={`{
  "movies_with_trailers": 104523,
  "total_trailers": 228491,
  "languages": 34,
  "by_type": {
    "trailer": 142000,
    "teaser": 31000,
    "clip": 18500,
    "featurette": 12000,
    "behind_the_scenes": 8500,
    "tv_spot": 7200,
    "bloopers": 3800,
    "red_band": 2100,
    "imax": 1400
  },
  "by_language": {
    "en": 165000,
    "es": 12400,
    "fr": 9800,
    "de": 7600,
    "ja": 6200,
    "pt": 5100,
    "ko": 4800
  }
}`}
                />
              </div>
            </section>

            {/* ── Usage Examples ────────────────────────────── */}
            <section id="usage">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Usage Examples</h2>

              <div className="space-y-6">
                <CodeBlock
                  language="python"
                  title="Python"
                  code={`import httpx

BASE = "${BASE}/data"

# Fetch a movie's trailers
movie = httpx.get(f"{BASE}/movie/tt0468569.json").json()
print(f"{movie['title']} ({movie['year']})")
for t in movie["trailers"]:
    print(f"  {t['type']}: https://youtube.com/watch?v={t['youtube_id']}")

# Fetch trending movies
trending = httpx.get(f"{BASE}/browse/trending.json").json()
for row in trending[:5]:
    imdb_id, title, year = row[0], row[1], row[2]
    print(f"{title} ({year}) — {imdb_id}")`}
                />

                <CodeBlock
                  language="javascript"
                  title="JavaScript"
                  code={`const BASE = "${BASE}/data";

// Fetch a movie's trailers
const res = await fetch(\`\${BASE}/movie/tt0468569.json\`);
const movie = await res.json();

console.log(\`\${movie.title} (\${movie.year})\`);
movie.trailers.forEach(t => {
  console.log(\`  \${t.type}: https://youtube.com/watch?v=\${t.youtube_id}\`);
});

// Fetch horror movies
const horror = await fetch(\`\${BASE}/browse/genre/horror.json\`);
const movies = await horror.json();
console.log(\`\${movies.length} horror movies with trailers\`);`}
                />

                <CodeBlock
                  language="bash"
                  title="curl + jq"
                  code={`# Get a movie and list its trailer URLs
curl -s ${BASE}/data/movie/tt0468569.json | \\
  jq -r '.trailers[] | "https://youtube.com/watch?v=\\(.youtube_id)"'

# Get database stats
curl -s ${BASE}/data/stats.json | jq .

# Get all 2024 movies
curl -s ${BASE}/data/browse/year/2024.json | jq length`}
                />

                <CodeBlock
                  language="bash"
                  title="The Trailer Database CLI"
                  code={`# Install the CLI
pip install trailerdb

# Search for a movie
trailerdb search "dark knight"

# Get trailer URLs for a movie
trailerdb get tt0468569 --urls

# Batch export: all horror trailers from 2020+
trailerdb batch "genre=horror year>=2020" --output manifest.txt

# Download trailers with yt-dlp
trailerdb batch "genre=horror year>=2020" --output - | yt-dlp -a -`}
                />
              </div>
            </section>

            {/* ── Data Format ──────────────────────────────── */}
            <section id="data-format">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Data Format</h2>

              {/* Movie Detail Schema */}
              <h3 className="font-display text-text-primary text-xl mb-4">Movie Detail Schema</h3>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-xs font-body uppercase tracking-wider text-text-muted">Field</th>
                      <th className="py-2 pr-4 text-xs font-body uppercase tracking-wider text-text-muted">Type</th>
                      <th className="py-2 text-xs font-body uppercase tracking-wider text-text-muted">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <FieldRow name="imdb_id" type="string" description="IMDb ID (e.g., tt0468569)" />
                    <FieldRow name="tmdb_id" type="number | null" description="TMDB ID" />
                    <FieldRow name="title" type="string" description="Movie title (English)" />
                    <FieldRow name="original_title" type="string | null" description="Title in the original language" />
                    <FieldRow name="year" type="number | null" description="Release year" />
                    <FieldRow name="imdb_rating" type="number | null" description="IMDb rating (0-10)" />
                    <FieldRow name="imdb_votes" type="number | null" description="Number of IMDb votes" />
                    <FieldRow name="runtime" type="number | null" description="Runtime in minutes" />
                    <FieldRow name="overview" type="string | null" description="Plot summary" />
                    <FieldRow name="poster_path" type="string | null" description="TMDB poster path (append to image.tmdb.org)" />
                    <FieldRow name="backdrop_path" type="string | null" description="TMDB backdrop path" />
                    <FieldRow name="original_language" type="string | null" description="ISO 639-1 language code" />
                    <FieldRow name="genres" type="string[]" description="Genre names (e.g., ['Action', 'Crime'])" />
                    <FieldRow name="slug" type="string" description="URL-friendly slug" />
                    <FieldRow name="trailers" type="Trailer[]" description="Array of trailer objects (see below)" />
                  </tbody>
                </table>
              </div>

              {/* Trailer Schema */}
              <h3 className="font-display text-text-primary text-xl mb-4">Trailer Object Schema</h3>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-xs font-body uppercase tracking-wider text-text-muted">Field</th>
                      <th className="py-2 pr-4 text-xs font-body uppercase tracking-wider text-text-muted">Type</th>
                      <th className="py-2 text-xs font-body uppercase tracking-wider text-text-muted">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <FieldRow name="youtube_id" type="string" description="YouTube video ID" />
                    <FieldRow name="title" type="string | null" description="Trailer title" />
                    <FieldRow name="type" type="TrailerType" description="One of: trailer, teaser, clip, behind_the_scenes, featurette, bloopers, tv_spot, red_band, imax" />
                    <FieldRow name="language" type="string | null" description="ISO 639-1 language code (e.g., 'en', 'ja')" />
                    <FieldRow name="region" type="string | null" description="ISO 3166-1 region code (e.g., 'US', 'JP')" />
                    <FieldRow name="is_official" type="boolean" description="Whether the trailer is an official studio release" />
                    <FieldRow name="published_at" type="string | null" description="Publication date (ISO format)" />
                    <FieldRow name="quality" type="number | null" description="Video resolution (e.g., 1080, 2160)" />
                    <FieldRow name="channel_name" type="string | null" description="YouTube channel name" />
                    <FieldRow name="duration" type="number | null" description="Duration in seconds" />
                    <FieldRow name="views" type="number | null" description="YouTube view count (may be stale)" />
                  </tbody>
                </table>
              </div>

              {/* Trailer Types */}
              <h3 className="font-display text-text-primary text-xl mb-4">Trailer Types</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
                {[
                  { type: 'trailer', color: 'bg-type-trailer', label: 'Trailer' },
                  { type: 'teaser', color: 'bg-type-teaser', label: 'Teaser' },
                  { type: 'clip', color: 'bg-type-clip', label: 'Clip' },
                  { type: 'featurette', color: 'bg-type-featurette', label: 'Featurette' },
                  { type: 'behind_the_scenes', color: 'bg-type-bts', label: 'Behind the Scenes' },
                  { type: 'bloopers', color: 'bg-type-bloopers', label: 'Bloopers' },
                  { type: 'tv_spot', color: 'bg-type-tv-spot', label: 'TV Spot' },
                  { type: 'red_band', color: 'bg-type-red-band', label: 'Red Band' },
                  { type: 'imax', color: 'bg-type-imax', label: 'IMAX' },
                ].map(({ type, color, label }) => (
                  <div key={type} className="flex items-center gap-2 px-3 py-2 rounded bg-bg-surface border border-border">
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-sm font-body text-text-secondary">{label}</span>
                    <span className="text-xs font-mono text-text-muted ml-auto">{type}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Downloads ────────────────────────────────── */}
            <section id="downloads">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Downloads & Export</h2>
              <p className="text-text-secondary font-body mb-6">
                For bulk access and offline analysis, the full dataset is available in multiple formats.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <DownloadCard
                  title="Static JSON API"
                  description="Fetch any movie's trailers via URL. No auth, no limits. Already live."
                  href={`${BASE}/data/stats.json`}
                  icon={<DatabaseIcon />}
                  live
                />
                <DownloadCard
                  title="Individual Movie JSON"
                  description="101K+ movie files at /data/movie/{imdb_id}.json. Try one now."
                  href={`${BASE}/data/movie/tt0468569.json`}
                  icon={<TableIcon />}
                  live
                />
                <DownloadCard
                  title="SQLite & CSV Downloads"
                  description="Full database download and CSV exports via GitHub Releases."
                  href="#"
                  icon={<DatabaseIcon />}
                  comingSoon
                />
                <DownloadCard
                  title="HuggingFace & Kaggle"
                  description="Parquet datasets for ML researchers. Coming soon."
                  href="#"
                  icon={<HuggingFaceIcon />}
                  comingSoon
                />
              </div>

              <div className="p-5 rounded-lg bg-bg-surface border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-type-teaser/15 text-type-teaser">CLI</span>
                  <code className="text-sm font-mono text-accent">pip install trailerdb</code>
                </div>
                <p className="text-sm text-text-secondary font-body mb-3">
                  The The Trailer Database CLI lets you search, query, and batch-export trailer data from the command line.
                </p>
                <Link
                  to="/export"
                  className="inline-flex items-center gap-2 text-sm font-body text-accent hover:text-accent-hover transition-colors"
                >
                  Try the web-based export tool
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Download card ──────────────────────────────────────────

function DownloadCard({ title, description, href, icon, live, comingSoon }: {
  title: string; description: string; href: string; icon: React.ReactNode; live?: boolean; comingSoon?: boolean
}) {
  const Tag = comingSoon ? 'div' : 'a'
  const linkProps = comingSoon ? {} : { href, target: '_blank' as const, rel: 'noopener noreferrer' }

  return (
    <Tag
      {...linkProps}
      className={`group flex items-start gap-4 p-4 rounded-lg bg-bg-surface border border-border transition-all ${
        comingSoon ? 'opacity-60' : 'hover:border-border-hover hover:bg-bg-overlay cursor-pointer'
      }`}
    >
      <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-bg-overlay text-accent group-hover:text-accent-hover transition-colors">
        {icon}
      </div>
      <div>
        <div className="font-body font-medium text-text-primary text-sm mb-1 group-hover:text-accent transition-colors flex items-center gap-2">
          {title}
          {live && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rating-green/15 text-rating-green">Live</span>
          )}
          {comingSoon && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/15 text-accent">Soon</span>
          )}
          {!comingSoon && (
            <svg className="inline w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          )}
        </div>
        <div className="text-xs text-text-muted font-body">{description}</div>
      </div>
    </Tag>
  )
}

// ── Icons ──────────────────────────────────────────────────

function DatabaseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  )
}

function TableIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
    </svg>
  )
}

function HuggingFaceIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-.5 3.5a1 1 0 110 2 1 1 0 010-2zm3 0a1 1 0 110 2 1 1 0 010-2zm-5.25 5c.414 0 .75.336.75.75 0 1.795 1.455 3.25 3.25 3.25s3.25-1.455 3.25-3.25a.75.75 0 011.5 0c0 2.623-2.127 4.75-4.75 4.75S7.5 13.623 7.5 11a.75.75 0 01.75-.75z" />
    </svg>
  )
}

function KaggleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H5.505c-.236 0-.354-.117-.354-.352V.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v14.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.281.18.046.149.034.233-.035.328L12.545 15.1l6.245 8.406c.07.118.07.209.035.353z" />
    </svg>
  )
}
