import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const GITHUB_REPO = 'mhadifilms/trailerdb'
const IMDB_URL_PATTERN = /imdb\.com\/title\/(tt\d+)/

interface ContributeFormProps {
  /** Pre-filled movie name parsed from the URL slug, shown in the issue title */
  movieName?: string
}

export function ContributeForm({ movieName }: ContributeFormProps) {
  const [imdbUrl, setImdbUrl] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(url: string): string | null {
    if (!url.trim()) return 'Please enter an IMDb URL.'
    if (!IMDB_URL_PATTERN.test(url)) {
      return 'Please enter a valid IMDb URL (e.g. https://www.imdb.com/title/tt1234567/).'
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validationError = validate(imdbUrl)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)

    const imdbMatch = imdbUrl.match(IMDB_URL_PATTERN)
    const imdbId = imdbMatch ? imdbMatch[1] : ''
    const fullImdbUrl = `https://www.imdb.com/title/${imdbId}/`

    const title = movieName
      ? `[Movie Request] ${movieName}`
      : `[Movie Request] ${imdbId}`

    const body = [
      '### IMDb URL',
      '',
      fullImdbUrl,
      '',
      '---',
      '*Submitted via The Trailer Database contribution form.*',
    ].join('\n')

    const issueUrl = new URL(`https://github.com/${GITHUB_REPO}/issues/new`)
    issueUrl.searchParams.set('title', title)
    issueUrl.searchParams.set('body', body)
    issueUrl.searchParams.set('labels', 'movie-request')

    window.open(issueUrl.toString(), '_blank', 'noopener,noreferrer')
    setSubmitted(true)
  }

  return (
    <AnimatePresence mode="wait">
      {submitted ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-bg-surface border border-border rounded-xl p-6 text-center max-w-md mx-auto"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/15 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="font-display text-text-primary text-xl mb-2">Thank You!</h3>
          <p className="text-text-secondary font-body text-sm leading-relaxed">
            We'll process your request and add trailers for this movie.
            You can track progress on the GitHub issue.
          </p>
          <button
            onClick={() => { setSubmitted(false); setImdbUrl('') }}
            className="mt-4 text-sm text-text-muted hover:text-accent font-body transition-colors cursor-pointer"
          >
            Submit another request
          </button>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onSubmit={handleSubmit}
          className="bg-bg-surface border border-border rounded-xl p-6 max-w-md mx-auto"
        >
          <h3 className="font-display text-text-primary text-lg mb-1">
            Help us add it
          </h3>
          <p className="text-text-secondary font-body text-sm mb-4">
            Paste the IMDb link for this movie, and we'll fetch its trailers.
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="imdb-url" className="block text-xs font-body text-text-muted mb-1.5">
                IMDb URL
              </label>
              <input
                id="imdb-url"
                type="url"
                value={imdbUrl}
                onChange={(e) => { setImdbUrl(e.target.value); setError(null) }}
                placeholder="https://www.imdb.com/title/tt1234567/"
                className="w-full px-3 py-2.5 rounded-lg bg-bg-base border border-border text-text-primary font-body text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                autoComplete="off"
                spellCheck={false}
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-crimson text-xs font-body mt-1.5"
                >
                  {error}
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-bg-base font-body font-semibold text-sm transition-colors cursor-pointer"
            >
              Submit Request
            </button>
          </div>

          <p className="text-text-muted font-body text-xs mt-3 leading-relaxed">
            This opens a pre-filled GitHub issue. You'll need a GitHub account to submit.
          </p>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
