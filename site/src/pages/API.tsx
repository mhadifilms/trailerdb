import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { SEOHead } from '../components/SEOHead'
import { CodeBlock } from '../components/CodeBlock'

// Table of contents sections
const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'movie-detail', label: 'Movie Detail', indent: true },
  { id: 'full-index', label: 'Full Index', indent: true },
  { id: 'browse-shards', label: 'Browse Shards', indent: true },
  { id: 'series-detail', label: 'Series Detail', indent: true },
  { id: 'series-index', label: 'Series Index', indent: true },
  { id: 'series-browse', label: 'Series Browse', indent: true },
  { id: 'stats', label: 'Stats', indent: true },
  { id: 'data-format', label: 'Data Format' },
  { id: 'trailer-schema', label: 'Trailer Schema', indent: true },
  { id: 'trailer-groups', label: 'Trailer Groups', indent: true },
  { id: 'engagement', label: 'Engagement Data', indent: true },
  { id: 'usage', label: 'Usage Examples' },
  { id: 'cli', label: 'CLI' },
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

function SchemaTable({ children }: { children: React.ReactNode }) {
  return (
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
          {children}
        </tbody>
      </table>
    </div>
  )
}

function SectionDivider() {
  return <div className="border-t border-border/30 my-2" />
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
        description="The Trailer Database API documentation. Free, open access to movie and series trailer data via static JSON files. No authentication, no rate limits. Includes YouTube engagement data, trailer groups, and 290K+ trailers."
      />

      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        {/* Page header */}
        <div className="max-w-3xl mb-12">
          <h1 className="font-display text-text-primary text-4xl md:text-5xl mb-4">
            API <span className="text-accent">Documentation</span>
          </h1>
          <p className="text-lg text-text-secondary font-body leading-relaxed">
            The complete reference for building with The Trailer Database. 290K+ trailers across 106K movies and 24K series, with YouTube engagement data, multilingual trailer groups, and more.
          </p>
        </div>

        {/* Layout: sidebar + content */}
        <div className="flex gap-10">
          {/* Sticky sidebar TOC -- desktop only */}
          <aside className="hidden lg:block w-52 shrink-0">
            <nav className="sticky top-24" aria-label="Table of contents">
              <div className="text-xs font-body uppercase tracking-wider text-text-muted mb-3">
                On this page
              </div>
              <ul className="space-y-0.5 border-l border-border">
                {TOC.map(item => (
                  <li key={item.id}>
                    <button
                      onClick={() => scrollTo(item.id)}
                      className={`block w-full text-left py-1.5 text-sm font-body transition-colors cursor-pointer ${
                        'indent' in item && item.indent ? 'pl-7' : 'pl-4'
                      } ${
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

            {/* == Overview == */}
            <section id="overview">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-4">Overview</h2>
              <div className="space-y-4 text-text-secondary font-body leading-relaxed">
                <p>
                  The Trailer Database provides free, open access to movie and TV series trailer data. All data is served as
                  static JSON files — no authentication required, no rate limits, no API keys.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <div className="p-4 rounded-lg bg-bg-surface border border-border text-center">
                    <div className="font-display text-accent text-xl mb-1">CORS</div>
                    <div className="text-xs text-text-muted">Browser-ready</div>
                  </div>
                </div>
                <p className="text-sm text-text-muted">
                  Base URL: <code className="font-mono text-accent">{BASE}/data/</code>
                </p>

                {/* At-a-glance stats */}
                <div className="p-4 rounded-lg bg-bg-surface border border-border">
                  <div className="text-xs font-body uppercase tracking-wider text-text-muted mb-3">Database at a glance</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6 text-sm">
                    <div>
                      <span className="text-text-muted">Movies</span>
                      <span className="block font-mono text-text-primary">106,869</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Movie trailers</span>
                      <span className="block font-mono text-text-primary">290,478</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Series</span>
                      <span className="block font-mono text-text-primary">24,467</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Series trailers</span>
                      <span className="block font-mono text-text-primary">39,791</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Languages</span>
                      <span className="block font-mono text-text-primary">30</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Total views</span>
                      <span className="block font-mono text-text-primary">202.8B</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Total likes</span>
                      <span className="block font-mono text-text-primary">1.5B</span>
                    </div>
                    <div>
                      <span className="text-text-muted">YouTube channels</span>
                      <span className="block font-mono text-text-primary">44,793</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* == Quick Start == */}
            <section id="quick-start">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-4">Quick Start</h2>
              <p className="text-text-secondary font-body mb-6">
                Get trailer data in three lines. No signup, no API key, no SDK required.
              </p>
              <div className="space-y-4">
                <CodeBlock
                  language="python"
                  title="Python -- Quick Start"
                  code={`import httpx
movie = httpx.get("${BASE}/data/movie/tt1375666.json").json()
print(f"{movie['title']}: {len(movie['trailers'])} trailers")`}
                />
                <CodeBlock
                  language="javascript"
                  title="JavaScript -- Quick Start"
                  code={`const movie = await fetch("${BASE}/data/movie/tt1375666.json").then(r => r.json());
console.log(\`\${movie.title}: \${movie.trailers.length} trailers\`);`}
                />
                <CodeBlock
                  language="bash"
                  title="curl -- Quick Start"
                  code={`curl -s ${BASE}/data/movie/tt1375666.json | jq '{title, trailer_count: (.trailers | length)}'`}
                />
              </div>
            </section>

            {/* == Endpoints == */}
            <section id="endpoints">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-2">Endpoints</h2>
              <p className="text-text-secondary font-body mb-8">
                All endpoints return JSON. All paths are relative to{' '}
                <code className="font-mono text-accent text-sm">{BASE}/data/</code>.
              </p>

              {/* ---- Movie Detail ---- */}
              <div id="movie-detail" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Movie Detail</h3>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/movie/{imdb_id}.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Returns full movie detail with all trailers, engagement data, and trailer groups for a given IMDb ID.
                  Each movie file includes YouTube views, likes, duration, and channel for every trailer, plus
                  multilingual trailer groups.
                </p>
                <div className="text-sm text-text-muted font-body mb-4">
                  Example: <code className="font-mono text-accent">/data/movie/tt0468569.json</code> (The Dark Knight)
                </div>
                <CodeBlock
                  language="json"
                  title="Response -- movie detail"
                  code={`{
  "imdb_id": "tt0468569",
  "tmdb_id": 155,
  "title": "The Dark Knight",
  "original_title": "The Dark Knight",
  "year": 2008,
  "release_date": null,
  "imdb_rating": 9.1,
  "imdb_votes": 3149407,
  "runtime": 152,
  "overview": "Batman raises the stakes in his war on crime...",
  "poster_path": "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  "backdrop_path": "/cfT29Im5VDvjE0RpyKOSdCKZal7.jpg",
  "original_language": "en",
  "genres": ["Action", "Crime", "Thriller"],
  "slug": "the-dark-knight-2008-tt0468569",
  "trailers": [
    {
      "youtube_id": "EXeTwQWrcwY",
      "title": "The Dark Knight - Official Trailer",
      "type": "trailer",
      "language": "en",
      "region": "US",
      "is_official": true,
      "published_at": "2007-12-15T00:00:00.000Z",
      "quality": 1080,
      "channel_name": "Warner Bros. Pictures",
      "duration": 150,
      "views": 45000000
    }
  ],
  "trailer_groups": [
    {
      "group_id": 771510,
      "type": "trailer",
      "title": "Official Trailer",
      "languages": {
        "en": {
          "youtube_id": "EXeTwQWrcwY",
          "title": "The Dark Knight - Official Trailer"
        },
        "fr": {
          "youtube_id": "k86T2LWOGMs",
          "title": "Bande-annonce officielle VF"
        },
        "de": {
          "youtube_id": "XL1og9BTZqY",
          "title": "The Dark Knight - Trailer Deutsch"
        }
      }
    }
  ]
}`}
                />
              </div>

              {/* ---- Full Index ---- */}
              <div id="full-index" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Full Index</h3>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/index.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Full browse index — a compact array-of-arrays format containing all 106K+ movies.
                  Approximately 14MB, so cache it aggressively.
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
                  title="Response -- index.json (truncated)"
                  code={`{
  "movies": [
    ["tt0468569", "The Dark Knight", 2008, 9.1, 3149407, "/qJ2tW...", [28, 80, 53], 155, "the-dark-knight-2008-tt0468569", 12, 89.2],
    ["tt1375666", "Inception", 2010, 8.8, 2400000, "/oYuLEt...", [28, 878, 53], 27205, "inception-2010-tt1375666", 8, 76.5]
  ],
  "fields": ["imdb_id", "title", "year", "rating", "votes", "poster", "genre_ids", "tmdb_id", "slug", "trailer_count", "popularity"],
  "genres": {"28": "Action", "12": "Adventure", "16": "Animation", "35": "Comedy", "80": "Crime"}
}`}
                />
              </div>

              {/* ---- Browse Shards ---- */}
              <div id="browse-shards" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Browse Shards (Movies)</h3>
                <p className="text-text-secondary font-body mb-6">
                  Pre-computed browse lists — smaller, focused subsets of the index for common queries.
                  All return the same compact array-of-arrays format as the full index.
                </p>

                {/* Trending */}
                <div className="mb-6 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/trending.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 movies by TMDB popularity score. Updated daily.
                  </p>
                </div>

                {/* Top Rated */}
                <div className="mb-6 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/top-rated.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 movies by IMDb rating (minimum 10K votes).
                  </p>
                </div>

                {/* Genre */}
                <div className="mb-6 pl-4 border-l-2 border-border">
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
                <div className="mb-6 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/year/{year}.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    All movies with trailers from a given year. Available range: 1920 to 2026.
                  </p>
                </div>
              </div>

              {/* ---- Series Detail ---- */}
              <div id="series-detail" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Series Detail</h3>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/series/{tmdb_id}.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Returns full series detail with all trailers for a given TMDB series ID.
                  Includes season count, air dates, and status (Returning Series, Ended, Canceled, etc.).
                </p>
                <div className="text-sm text-text-muted font-body mb-4">
                  Example: <code className="font-mono text-accent">/data/series/1399.json</code> (Game of Thrones)
                </div>
                <CodeBlock
                  language="json"
                  title="Response -- series detail"
                  code={`{
  "tmdb_id": 1399,
  "name": "Game of Thrones",
  "original_name": "Game of Thrones",
  "first_air_date": "2011-04-17",
  "overview": "Seven noble families fight for control of the mythical land of Westeros...",
  "poster_path": "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
  "backdrop_path": "/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg",
  "status": "Ended",
  "number_of_seasons": 8,
  "vote_average": 8.459,
  "vote_count": 26522,
  "original_language": "en",
  "genres": ["Sci-Fi & Fantasy", "Drama", "Action & Adventure"],
  "slug": "game-of-thrones-1399",
  "trailers": [
    {
      "youtube_id": "KPLWWIOCOOQ",
      "title": "Game of Thrones | Official Series Trailer",
      "trailer_type": "trailer",
      "language": "en",
      "region": "US",
      "is_official": true,
      "published_at": "2021-04-05T16:00:07.000Z",
      "quality": 1080
    }
  ]
}`}
                />
                <div className="mt-4 p-3 rounded-lg bg-bg-surface border border-border text-sm text-text-muted font-body">
                  Note: Series trailers use <code className="font-mono text-accent">trailer_type</code> instead of{' '}
                  <code className="font-mono text-accent">type</code> for the trailer kind field.
                </div>
              </div>

              {/* ---- Series Index ---- */}
              <div id="series-index" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Series Index</h3>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/series-index.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Compact index of all 24K+ series. Same array-of-arrays format as the movie index.
                </p>
                <div className="p-4 rounded-lg bg-bg-surface border border-border mb-4">
                  <div className="text-xs font-body uppercase tracking-wider text-text-muted mb-3">Field order (per row)</div>
                  <div className="flex flex-wrap gap-2">
                    {['tmdb_id', 'name', 'year', 'rating', 'votes', 'poster', 'genre_ids', 'slug', 'trailer_count', 'popularity'].map((f, i) => (
                      <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-bg-overlay text-xs font-mono">
                        <span className="text-text-muted">{i}</span>
                        <span className="text-accent">{f}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <CodeBlock
                  language="json"
                  title="Response -- series-index.json (truncated)"
                  code={`{
  "series": [
    [1399, "Game of Thrones", 2011, 8.459, 26522, "/1XS1oq...", [10765, 18, 10759], "game-of-thrones-1399", 7, 231.24],
    [66732, "Stranger Things", 2016, 8.573, 20913, "/uOOtwV...", [10765, 9648, 10759], "stranger-things-66732", 5, 166.17]
  ],
  "fields": ["tmdb_id", "name", "year", "rating", "votes", "poster", "genre_ids", "slug", "trailer_count", "popularity"],
  "genres": {"10759": "Action & Adventure", "18": "Drama", "10765": "Sci-Fi & Fantasy"}
}`}
                />
              </div>

              {/* ---- Series Browse ---- */}
              <div id="series-browse" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Series Browse Shards</h3>
                <p className="text-text-secondary font-body mb-6">
                  Pre-computed browse lists for series, in the same compact format as the series index.
                </p>

                <div className="mb-6 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/series-trending.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 series by TMDB popularity score. Updated daily.
                  </p>
                </div>

                <div className="mb-6 pl-4 border-l-2 border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <EndpointBadge method="GET" />
                    <EndpointUrl url="/data/browse/series-top-rated.json" />
                  </div>
                  <p className="text-text-secondary font-body text-sm">
                    Top 100 series by TMDB vote average.
                  </p>
                </div>
              </div>

              {/* ---- Stats ---- */}
              <div id="stats" className="mb-14">
                <h3 className="font-display text-text-primary text-xl mb-4">Stats</h3>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <EndpointBadge method="GET" />
                  <EndpointUrl url="/data/stats.json" />
                </div>
                <p className="text-text-secondary font-body mb-4">
                  Database-wide statistics including totals, breakdowns by type and language, YouTube engagement aggregates, top channels, and most viewed trailers.
                </p>

                <SchemaTable>
                  <FieldRow name="movies_with_trailers" type="number" description="Total movies with at least one trailer" />
                  <FieldRow name="total_trailers" type="number" description="Total movie trailers in the database" />
                  <FieldRow name="languages" type="number" description="Number of distinct languages" />
                  <FieldRow name="series_with_trailers" type="number" description="Total series with at least one trailer" />
                  <FieldRow name="total_series_trailers" type="number" description="Total series trailers in the database" />
                  <FieldRow name="total_views" type="number" description="Sum of all YouTube views across all trailers" />
                  <FieldRow name="total_likes" type="number" description="Sum of all YouTube likes across all trailers" />
                  <FieldRow name="avg_duration_seconds" type="number" description="Average trailer duration in seconds" />
                  <FieldRow name="unique_channels" type="number" description="Number of distinct YouTube channels" />
                  <FieldRow name="by_type" type="object" description="Trailer count per type (trailer, teaser, clip, etc.)" />
                  <FieldRow name="by_language" type="object" description="Trailer count per ISO 639-1 language code" />
                  <FieldRow name="top_channels" type="Channel[]" description="Top 20 channels by trailer count (name, trailers, views)" />
                  <FieldRow name="most_viewed" type="MostViewed[]" description="Top 20 most viewed trailers (youtube_id, title, views, type, movie, imdb_id)" />
                  <FieldRow name="duration_by_type" type="object" description="Average duration and count per trailer type" />
                </SchemaTable>

                <CodeBlock
                  language="json"
                  title="Response -- stats.json (abbreviated)"
                  code={`{
  "movies_with_trailers": 106869,
  "total_trailers": 290478,
  "languages": 30,
  "series_with_trailers": 24467,
  "total_series_trailers": 39791,
  "total_views": 202819848506,
  "total_likes": 1532815939,
  "avg_duration_seconds": 197,
  "unique_channels": 44793,
  "by_type": {
    "trailer": 197965,
    "clip": 31091,
    "teaser": 28378,
    "featurette": 24269,
    "behind_the_scenes": 7776,
    "red_band": 419,
    "bloopers": 325,
    "tv_spot": 146,
    "imax": 109
  },
  "by_language": {
    "en": 163342,
    "fr": 27240,
    "de": 20866,
    "es": 14869,
    "ja": 11084,
    "it": 9485,
    "ru": 7812,
    "ko": 7392
  },
  "top_channels": [
    {"name": "YouTube Movies", "trailers": 8182, "views": 1526825006},
    {"name": "Sony Pictures Entertainment", "trailers": 2074, "views": 4967790887},
    {"name": "Warner Bros.", "trailers": 1846, "views": 7366183596}
  ],
  "most_viewed": [
    {"youtube_id": "L0MK7qz13bU", "title": "Let It Go Sing-along", "views": 3639503317, "type": "clip", "movie": "Frozen", "imdb_id": "tt2294629"}
  ],
  "duration_by_type": {
    "trailer": {"avg_seconds": 150, "count": 197965},
    "teaser": {"avg_seconds": 51, "count": 28378},
    "clip": {"avg_seconds": 312, "count": 31091},
    "featurette": {"avg_seconds": 577, "count": 24269}
  }
}`}
                />
              </div>
            </section>

            {/* == Data Format == */}
            <section id="data-format">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Data Format</h2>

              {/* Movie Detail Schema */}
              <h3 className="font-display text-text-primary text-xl mb-4">Movie Detail Schema</h3>
              <SchemaTable>
                <FieldRow name="imdb_id" type="string" description="IMDb ID (e.g., tt0468569)" />
                <FieldRow name="tmdb_id" type="number | null" description="TMDB ID" />
                <FieldRow name="title" type="string" description="Movie title (English)" />
                <FieldRow name="original_title" type="string | null" description="Title in the original language" />
                <FieldRow name="year" type="number | null" description="Release year" />
                <FieldRow name="release_date" type="string | null" description="Full release date (ISO format, when available)" />
                <FieldRow name="imdb_rating" type="number | null" description="IMDb rating (0-10)" />
                <FieldRow name="imdb_votes" type="number | null" description="Number of IMDb votes" />
                <FieldRow name="runtime" type="number | null" description="Runtime in minutes" />
                <FieldRow name="overview" type="string | null" description="Plot summary" />
                <FieldRow name="poster_path" type="string | null" description="TMDB poster path (append to https://image.tmdb.org/t/p/w500)" />
                <FieldRow name="backdrop_path" type="string | null" description="TMDB backdrop path" />
                <FieldRow name="original_language" type="string | null" description="ISO 639-1 language code" />
                <FieldRow name="genres" type="string[]" description="Genre names (e.g., ['Action', 'Crime'])" />
                <FieldRow name="slug" type="string" description="URL-friendly slug" />
                <FieldRow name="trailers" type="Trailer[]" description="Array of trailer objects (see below)" />
                <FieldRow name="trailer_groups" type="TrailerGroup[]" description="Multilingual trailer groups (see below)" />
              </SchemaTable>

              {/* Series Detail Schema */}
              <h3 className="font-display text-text-primary text-xl mb-4">Series Detail Schema</h3>
              <SchemaTable>
                <FieldRow name="tmdb_id" type="number" description="TMDB series ID" />
                <FieldRow name="name" type="string" description="Series name (English)" />
                <FieldRow name="original_name" type="string | null" description="Name in the original language" />
                <FieldRow name="first_air_date" type="string | null" description="First air date (ISO format)" />
                <FieldRow name="overview" type="string | null" description="Plot summary" />
                <FieldRow name="poster_path" type="string | null" description="TMDB poster path" />
                <FieldRow name="backdrop_path" type="string | null" description="TMDB backdrop path" />
                <FieldRow name="status" type="string | null" description="Returning Series, Ended, Canceled, In Production, or Planned" />
                <FieldRow name="number_of_seasons" type="number | null" description="Total season count" />
                <FieldRow name="vote_average" type="number | null" description="TMDB vote average (0-10)" />
                <FieldRow name="vote_count" type="number | null" description="TMDB vote count" />
                <FieldRow name="original_language" type="string | null" description="ISO 639-1 language code" />
                <FieldRow name="genres" type="string[]" description="Genre names" />
                <FieldRow name="slug" type="string" description="URL-friendly slug" />
                <FieldRow name="trailers" type="SeriesTrailer[]" description="Array of trailer objects (uses trailer_type field)" />
              </SchemaTable>

              <SectionDivider />

              {/* Trailer Schema */}
              <div id="trailer-schema">
                <h3 className="font-display text-text-primary text-xl mb-4">Trailer Object Schema</h3>
                <p className="text-text-secondary font-body text-sm mb-4">
                  Each trailer in the <code className="font-mono text-accent">trailers</code> array has these fields.
                  Movie trailers include YouTube engagement data (views, duration, channel).
                </p>
                <SchemaTable>
                  <FieldRow name="youtube_id" type="string" description="YouTube video ID" />
                  <FieldRow name="title" type="string | null" description="Trailer title" />
                  <FieldRow name="type" type="TrailerType" description="One of: trailer, teaser, clip, behind_the_scenes, featurette, bloopers, tv_spot, red_band, imax" />
                  <FieldRow name="language" type="string | null" description="ISO 639-1 language code (e.g., 'en', 'ja')" />
                  <FieldRow name="region" type="string | null" description="ISO 3166-1 region code (e.g., 'US', 'JP')" />
                  <FieldRow name="is_official" type="boolean" description="Whether the trailer is an official studio release" />
                  <FieldRow name="published_at" type="string | null" description="Publication date (ISO 8601 timestamp)" />
                  <FieldRow name="quality" type="number | null" description="Video resolution (e.g., 360, 480, 720, 1080, 2160)" />
                  <FieldRow name="channel_name" type="string | null" description="YouTube channel name that published the trailer" />
                  <FieldRow name="duration" type="number | null" description="Duration in seconds" />
                  <FieldRow name="views" type="number | null" description="YouTube view count (updated periodically)" />
                </SchemaTable>
              </div>

              <SectionDivider />

              {/* Trailer Groups */}
              <div id="trailer-groups">
                <h3 className="font-display text-text-primary text-xl mb-4">Trailer Groups</h3>
                <p className="text-text-secondary font-body text-sm mb-4">
                  Trailer groups bundle the same logical trailer across multiple languages. Use these to let users pick
                  their preferred language for a given trailer, or to build a multilingual trailer player.
                  Each group has a type, a canonical title, and a map of language codes to YouTube IDs.
                </p>
                <SchemaTable>
                  <FieldRow name="group_id" type="number" description="Unique group identifier" />
                  <FieldRow name="type" type="TrailerType" description="Trailer type (same enum as individual trailers)" />
                  <FieldRow name="title" type="string" description="Canonical title for this group" />
                  <FieldRow name="languages" type="object" description="Map of ISO 639-1 codes to {youtube_id, title}" />
                </SchemaTable>
                <CodeBlock
                  language="json"
                  title="Example -- trailer group with 3 languages"
                  code={`{
  "group_id": 771510,
  "type": "trailer",
  "title": "Official Trailer",
  "languages": {
    "en": {
      "youtube_id": "EXeTwQWrcwY",
      "title": "The Dark Knight - Official Trailer"
    },
    "fr": {
      "youtube_id": "k86T2LWOGMs",
      "title": "Bande-annonce officielle VF"
    },
    "ko": {
      "youtube_id": "k6Bg9FROE4o",
      "title": "\\ub2e4\\ud06c \\ub098\\uc774\\ud2b8 \\uc608\\uace0\\ud3b8"
    }
  }
}`}
                />
              </div>

              <SectionDivider />

              {/* Engagement Data */}
              <div id="engagement">
                <h3 className="font-display text-text-primary text-xl mb-4">YouTube Engagement Data</h3>
                <p className="text-text-secondary font-body text-sm mb-4">
                  Each movie trailer includes YouTube engagement metrics collected from the YouTube API.
                  These fields may be <code className="font-mono text-accent">null</code> for trailers where data
                  was unavailable.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="p-4 rounded-lg bg-bg-surface border border-border">
                    <div className="font-mono text-accent text-sm mb-1">views</div>
                    <div className="text-xs text-text-muted">YouTube view count. Updated periodically. Can be null.</div>
                  </div>
                  <div className="p-4 rounded-lg bg-bg-surface border border-border">
                    <div className="font-mono text-accent text-sm mb-1">duration</div>
                    <div className="text-xs text-text-muted">Video length in seconds. Avg 150s for trailers, 51s for teasers.</div>
                  </div>
                  <div className="p-4 rounded-lg bg-bg-surface border border-border">
                    <div className="font-mono text-accent text-sm mb-1">channel_name</div>
                    <div className="text-xs text-text-muted">The YouTube channel. 44K+ unique channels in the database.</div>
                  </div>
                </div>
                <p className="text-text-secondary font-body text-sm mb-4">
                  The <code className="font-mono text-accent">stats.json</code> endpoint provides aggregated engagement data including{' '}
                  <code className="font-mono text-accent">total_views</code>,{' '}
                  <code className="font-mono text-accent">total_likes</code>,{' '}
                  <code className="font-mono text-accent">top_channels</code> (ranked by trailer count), and{' '}
                  <code className="font-mono text-accent">most_viewed</code> (the top 20 most-viewed trailers globally with 3.6B views at the top).
                </p>
              </div>

              <SectionDivider />

              {/* Trailer Types */}
              <h3 className="font-display text-text-primary text-xl mb-4">Trailer Types</h3>
              <p className="text-text-secondary font-body text-sm mb-4">
                Every trailer has a type. Average durations vary significantly by type.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
                {[
                  { type: 'trailer', color: 'bg-type-trailer', label: 'Trailer', avg: '~150s', count: '197,965' },
                  { type: 'teaser', color: 'bg-type-teaser', label: 'Teaser', avg: '~51s', count: '28,378' },
                  { type: 'clip', color: 'bg-type-clip', label: 'Clip', avg: '~312s', count: '31,091' },
                  { type: 'featurette', color: 'bg-type-featurette', label: 'Featurette', avg: '~577s', count: '24,269' },
                  { type: 'behind_the_scenes', color: 'bg-type-bts', label: 'Behind the Scenes', avg: '~280s', count: '7,776' },
                  { type: 'bloopers', color: 'bg-type-bloopers', label: 'Bloopers', avg: '~203s', count: '325' },
                  { type: 'tv_spot', color: 'bg-type-tv-spot', label: 'TV Spot', avg: '~43s', count: '146' },
                  { type: 'red_band', color: 'bg-type-red-band', label: 'Red Band', avg: '~132s', count: '419' },
                  { type: 'imax', color: 'bg-type-imax', label: 'IMAX', avg: '~145s', count: '109' },
                ].map(({ type, color, label, avg, count }) => (
                  <div key={type} className="flex items-center gap-2 px-3 py-2 rounded bg-bg-surface border border-border">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-body text-text-secondary block">{label}</span>
                      <span className="text-[10px] font-mono text-text-muted">{count} / {avg}</span>
                    </div>
                    <span className="text-xs font-mono text-text-muted ml-auto hidden sm:block">{type}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* == Usage Examples == */}
            <section id="usage">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Usage Examples</h2>

              <div className="space-y-8">
                {/* Python examples */}
                <div>
                  <h3 className="font-display text-text-primary text-lg mb-4">Python</h3>
                  <div className="space-y-4">
                    <CodeBlock
                      language="python"
                      title="Get most viewed trailer for a movie"
                      code={`import httpx

BASE = "${BASE}/data"

movie = httpx.get(f"{BASE}/movie/tt0468569.json").json()
best = max(movie["trailers"], key=lambda t: t.get("views") or 0)
print(f"Most viewed: {best['title']} — {best['views']:,} views")
print(f"https://youtube.com/watch?v={best['youtube_id']}")`}
                    />
                    <CodeBlock
                      language="python"
                      title="Find all French trailers for a movie"
                      code={`import httpx

BASE = "${BASE}/data"

movie = httpx.get(f"{BASE}/movie/tt0468569.json").json()
french = [t for t in movie["trailers"] if t["language"] == "fr"]
print(f"{movie['title']}: {len(french)} French trailers")
for t in french:
    print(f"  {t['title']} — https://youtube.com/watch?v={t['youtube_id']}")`}
                    />
                    <CodeBlock
                      language="python"
                      title="Use trailer groups for a language picker"
                      code={`import httpx

BASE = "${BASE}/data"

movie = httpx.get(f"{BASE}/movie/tt0468569.json").json()
for group in movie.get("trailer_groups", []):
    langs = ", ".join(group["languages"].keys())
    print(f"{group['title']} ({group['type']}) — available in: {langs}")
    # Pick the user's preferred language, fall back to English
    preferred = group["languages"].get("fr") or group["languages"].get("en")
    if preferred:
        print(f"  -> https://youtube.com/watch?v={preferred['youtube_id']}")`}
                    />
                    <CodeBlock
                      language="python"
                      title="Fetch trending series"
                      code={`import httpx

BASE = "${BASE}/data"

trending = httpx.get(f"{BASE}/browse/series-trending.json").json()
for row in trending["series"][:10]:
    tmdb_id, name, year, rating = row[0], row[1], row[2], row[3]
    print(f"{name} ({year}) — {rating}/10")`}
                    />
                  </div>
                </div>

                {/* JavaScript examples */}
                <div>
                  <h3 className="font-display text-text-primary text-lg mb-4">JavaScript</h3>
                  <div className="space-y-4">
                    <CodeBlock
                      language="javascript"
                      title="Build a trailer player"
                      code={`const BASE = "${BASE}/data";

const movie = await fetch(\`\${BASE}/movie/tt0468569.json\`).then(r => r.json());
const trailer = movie.trailers[0];

// Privacy-enhanced embed URL (no cookies)
const embedUrl = \`https://www.youtube-nocookie.com/embed/\${trailer.youtube_id}\`;

// Build the iframe
const iframe = document.createElement("iframe");
iframe.src = embedUrl;
iframe.width = "800";
iframe.height = "450";
iframe.allow = "autoplay; encrypted-media";
iframe.allowFullscreen = true;
document.getElementById("player").appendChild(iframe);

console.log(\`Playing: \${trailer.title} (\${trailer.views?.toLocaleString() ?? "?"} views)\`);`}
                    />
                    <CodeBlock
                      language="javascript"
                      title="Browse movies by genre"
                      code={`const BASE = "${BASE}/data";

const horror = await fetch(\`\${BASE}/browse/genre/horror.json\`).then(r => r.json());
console.log(\`\${horror.movies.length} horror movies with trailers\`);

// Each row is a compact array: [imdb_id, title, year, rating, ...]
for (const row of horror.movies.slice(0, 5)) {
  const [imdb_id, title, year, rating] = row;
  console.log(\`\${title} (\${year}) — \${rating}/10\`);
  // Fetch full trailer data for this movie
  const movie = await fetch(\`\${BASE}/movie/\${imdb_id}.json\`).then(r => r.json());
  console.log(\`  \${movie.trailers.length} trailers available\`);
}`}
                    />
                    <CodeBlock
                      language="javascript"
                      title="Get engagement stats"
                      code={`const stats = await fetch("${BASE}/data/stats.json").then(r => r.json());

console.log(\`Total views: \${(stats.total_views / 1e9).toFixed(1)}B\`);
console.log(\`Total likes: \${(stats.total_likes / 1e6).toFixed(0)}M\`);
console.log(\`Avg duration: \${stats.avg_duration_seconds}s\`);

// Top channels by trailer count
for (const ch of stats.top_channels.slice(0, 5)) {
  console.log(\`\${ch.name}: \${ch.trailers} trailers, \${(ch.views / 1e6).toFixed(1)}M views\`);
}`}
                    />
                  </div>
                </div>

                {/* curl examples */}
                <div>
                  <h3 className="font-display text-text-primary text-lg mb-4">curl + jq</h3>
                  <div className="space-y-4">
                    <CodeBlock
                      language="bash"
                      title="Get top channels from stats"
                      code={`curl -s ${BASE}/data/stats.json | \\
  jq '.top_channels[:5][] | "\\(.name): \\(.trailers) trailers, \\(.views) views"'`}
                    />
                    <CodeBlock
                      language="bash"
                      title="Get most viewed trailers globally"
                      code={`curl -s ${BASE}/data/stats.json | \\
  jq '.most_viewed[:5][] | "\\(.movie) — \\(.title): \\(.views) views"'`}
                    />
                    <CodeBlock
                      language="bash"
                      title="List all trailer URLs for a movie"
                      code={`curl -s ${BASE}/data/movie/tt0468569.json | \\
  jq -r '.trailers[] | "\\(.type) [\\(.language)] https://youtube.com/watch?v=\\(.youtube_id)"'`}
                    />
                    <CodeBlock
                      language="bash"
                      title="Get a series and its trailers"
                      code={`curl -s ${BASE}/data/series/1399.json | \\
  jq '{name, seasons: .number_of_seasons, status, trailers: [.trailers[] | {title, type: .trailer_type}]}'`}
                    />
                    <CodeBlock
                      language="bash"
                      title="Trailer type breakdown"
                      code={`curl -s ${BASE}/data/stats.json | \\
  jq '.duration_by_type | to_entries[] | "\\(.key): \\(.value.count) videos, avg \\(.value.avg_seconds)s"'`}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* == CLI == */}
            <section id="cli">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-4">CLI</h2>
              <p className="text-text-secondary font-body mb-6">
                The Trailer Database CLI provides a fast command-line interface for searching, querying, and
                exporting trailer data. Install it with pip and start exploring.
              </p>

              <div className="space-y-4">
                <CodeBlock
                  language="bash"
                  title="Install"
                  code={`pip install trailerdb`}
                />
                <CodeBlock
                  language="bash"
                  title="Search and explore"
                  code={`# Search for a movie by title
trailerdb search "inception"

# Get full movie details with engagement metrics
trailerdb movie tt1375666 --engagement

# Search for a series
trailerdb search "game of thrones" --series`}
                />
                <CodeBlock
                  language="bash"
                  title="Download trailers"
                  code={`# Download the best quality trailer for a movie
trailerdb download tt1375666 --best

# Download all English trailers
trailerdb download tt1375666 --language en

# Batch export: all horror trailers from 2020+
trailerdb batch "genre=horror year>=2020" --output manifest.txt

# Pipe to yt-dlp for direct download
trailerdb batch "genre=horror year>=2020" --output - | yt-dlp -a -`}
                />
              </div>

              <div className="mt-6 p-4 rounded-lg bg-bg-surface border border-border">
                <Link
                  to="/export"
                  className="inline-flex items-center gap-2 text-sm font-body text-accent hover:text-accent-hover transition-colors"
                >
                  Prefer a GUI? Try the web-based export tool
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            </section>

            {/* == Downloads == */}
            <section id="downloads">
              <h2 className="font-display text-text-primary text-2xl md:text-3xl mb-6">Downloads & Export</h2>
              <p className="text-text-secondary font-body mb-6">
                For bulk access and offline analysis, the full dataset is available in multiple formats.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <DownloadCard
                  title="Static JSON API"
                  description="Fetch any movie's or series' trailers via URL. No auth, no limits. Already live."
                  href={`${BASE}/data/stats.json`}
                  icon={<DatabaseIcon />}
                  live
                />
                <DownloadCard
                  title="Individual JSON Files"
                  description="106K+ movie files and 24K+ series files. Try one now."
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
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

// -- Download card --

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

// -- Icons --

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
