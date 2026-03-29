import { useSiteStats } from '../lib/api'
import { SEOHead } from '../components/SEOHead'

export function About() {
  const { data: stats } = useSiteStats()

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many movies does The Trailer Database have?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The Trailer Database contains trailers for over ${stats ? stats.movies_with_trailers.toLocaleString() : '100,000'} movies.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What languages are trailers available in?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Trailers are available in ${stats ? stats.languages : '30'}+ languages including English, French, Spanish, German, Japanese, Korean, Chinese, and many more.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What types of trailers does The Trailer Database collect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Trailer Database collects theatrical trailers, teasers, TV spots, red band trailers, IMAX trailers, clips, featurettes, behind the scenes footage, and bloopers.',
        },
      },
    ],
  }

  return (
    <>
      <SEOHead
        title="About"
        description="The Trailer Database is the largest open-source database of movie trailers. Browse trailers for 100,000+ movies in 30+ languages."
        jsonLd={faqJsonLd}
      />

      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-display text-text-primary text-4xl md:text-5xl mb-8">
          About <span className="text-accent">The Trailer Database</span>
        </h1>

        <div className="prose prose-invert max-w-none space-y-6 text-text-secondary font-body leading-relaxed">
          <p className="text-lg">
            The Trailer Database is the largest open-source database of movie trailers. We catalog every trailer
            for every movie, in every language — making it easy to find and watch trailers from around the world.
          </p>

          {stats && (
            <div className="grid grid-cols-3 gap-4 py-6">
              <div className="text-center p-4 rounded-lg bg-bg-surface border border-border">
                <div className="font-display text-accent text-2xl">{stats.movies_with_trailers.toLocaleString()}</div>
                <div className="text-text-muted text-xs uppercase tracking-wider mt-1">Movies</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-bg-surface border border-border">
                <div className="font-display text-accent text-2xl">{stats.total_trailers.toLocaleString()}</div>
                <div className="text-text-muted text-xs uppercase tracking-wider mt-1">Trailers</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-bg-surface border border-border">
                <div className="font-display text-accent text-2xl">{stats.languages}+</div>
                <div className="text-text-muted text-xs uppercase tracking-wider mt-1">Languages</div>
              </div>
            </div>
          )}

          <h2 className="font-display text-text-primary text-2xl mt-10">How It Works</h2>
          <p>
            The Trailer Database collects trailer data from TMDB (The Movie Database) and enriches it with
            YouTube metadata. Our automated pipeline processes hundreds of thousands of movies and
            discovers trailers in 30+ languages using a tiered collection strategy.
          </p>

          <h2 className="font-display text-text-primary text-2xl mt-10">Trailer Types</h2>
          <p>
            We collect every type of video content associated with a movie: theatrical trailers,
            teasers, TV spots, red band (restricted) trailers, IMAX trailers, clips, featurettes,
            behind the scenes footage, and bloopers.
          </p>

          <h2 className="font-display text-text-primary text-2xl mt-10">Multilingual</h2>
          <p>
            Trailers are available in English, French, Spanish, German, Japanese, Portuguese,
            Korean, Chinese, Italian, Russian, Hindi, Arabic, and many more languages. On each
            movie page, you can filter trailers by language.
          </p>

          <h2 className="font-display text-text-primary text-2xl mt-10">Open Source</h2>
          <p>
            The Trailer Database is fully open source. The database, collection pipeline, and this website
            are all available on{' '}
            <a
              href="https://github.com/mhadifilms/trailerdb"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover underline"
            >
              GitHub
            </a>
            . Contributions are welcome.
          </p>

          <h2 className="font-display text-text-primary text-2xl mt-10">Data Attribution</h2>
          <p>
            Movie metadata is sourced from{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">TMDB</a>.
            This product uses the TMDB API but is not endorsed or certified by TMDB.
            Trailer videos are hosted on YouTube and embedded via YouTube's standard embed player.
          </p>
        </div>
      </div>
    </>
  )
}
