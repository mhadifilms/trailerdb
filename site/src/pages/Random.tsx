import { RandomTrailer } from '../components/RandomTrailer'
import { SEOHead } from '../components/SEOHead'

export function Random() {
  return (
    <>
      <SEOHead
        title="Random Trailer"
        description="Watch a random movie trailer from The Trailer Database. Discover new films from 130,000+ movies & series."
      />

      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 pt-24 pb-16">
        <header className="text-center mb-10">
          <h1 className="font-display text-text-primary text-3xl md:text-4xl lg:text-5xl">
            Random Trailer
          </h1>
          <p className="text-text-muted font-body text-base mt-2 max-w-md mx-auto">
            Discover something new. A random trailer from over 130,000 movies & series.
          </p>
        </header>

        <div className="w-full max-w-3xl">
          <RandomTrailer />
        </div>
      </div>
    </>
  )
}
