import { Helmet } from 'react-helmet-async'
import { posterUrl } from '../lib/utils'

interface SEOProps {
  title?: string
  description?: string
  image?: string | null
  url?: string
  type?: 'website' | 'video.movie'
  jsonLd?: object
}

export function SEOHead({ title, description, image, url, type = 'website', jsonLd }: SEOProps) {
  const fullTitle = title ? `${title} | The Trailer Database` : 'The Trailer Database'
  const desc = description || 'Every trailer, every movie, every language. Browse 130,000+ movies & series and 330,000+ trailers in 30 languages.'

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:type" content={type} />
      {image && <meta property="og:image" content={image} />}
      {url && <meta property="og:url" content={url} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {image && <meta name="twitter:image" content={image} />}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      )}
    </Helmet>
  )
}

/** Generate JSON-LD for a movie page */
export function movieJsonLd(movie: {
  title: string
  year: number | null
  imdb_rating: number | null
  imdb_votes: number | null
  overview: string | null
  poster_path: string | null
  genres: string[]
  trailers: { youtube_id: string; title: string | null; published_at: string | null }[]
}) {
  const primaryTrailer = movie.trailers[0]

  return {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    datePublished: movie.year ? `${movie.year}` : undefined,
    description: movie.overview || undefined,
    image: movie.poster_path ? posterUrl(movie.poster_path, 'w500') : undefined,
    genre: movie.genres.length > 0 ? movie.genres : undefined,
    aggregateRating: movie.imdb_rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: movie.imdb_rating,
          bestRating: 10,
          ratingCount: movie.imdb_votes,
        }
      : undefined,
    trailer: primaryTrailer
      ? {
          '@type': 'VideoObject',
          name: primaryTrailer.title || `${movie.title} Trailer`,
          embedUrl: `https://www.youtube.com/embed/${primaryTrailer.youtube_id}`,
          thumbnailUrl: `https://img.youtube.com/vi/${primaryTrailer.youtube_id}/hqdefault.jpg`,
          uploadDate: primaryTrailer.published_at || undefined,
        }
      : undefined,
  }
}
