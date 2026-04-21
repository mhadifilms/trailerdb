import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMovieDetail } from '../../lib/api'
import {
  suggestedQuestions,
  buildFullPrompt,
  claudeUrl,
  chatgptUrl,
  type QuestionContext,
} from '../../lib/ai-prompts'

/** Floating "Ask AI" panel. Sticks bottom-right; context adapts to current analytics view. */
export function AIAskPanel() {
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const movieId = searchParams.get('movie')
  const seriesId = searchParams.get('series')
  const mode = searchParams.get('mode')

  const { data: movie } = useMovieDetail(movieId)

  const ctx: QuestionContext = useMemo(() => {
    if (movieId && movie) {
      return { kind: 'movie', imdbId: movieId, title: movie.title, year: movie.year }
    }
    if (movieId) {
      return { kind: 'movie', imdbId: movieId, title: 'this movie' }
    }
    if (seriesId) {
      return { kind: 'series', tmdbId: seriesId, name: 'this series' }
    }
    if (mode === 'explore') return { kind: 'explore' }
    if (mode === 'compare') return { kind: 'compare' }
    return { kind: 'dashboard' }
  }, [movieId, movie, seriesId, mode])

  const questions = useMemo(() => suggestedQuestions(ctx), [ctx])

  // Close on ESC, or outside click
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  // Reset copy indicator after 2s
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const activeQuestion = question.trim()
  const hasQuestion = activeQuestion.length > 0
  const fullPrompt = hasQuestion ? buildFullPrompt(activeQuestion) : ''

  function pickSuggestion(prompt: string) {
    setQuestion(prompt)
  }

  async function copyPrompt() {
    if (!hasQuestion) return
    try {
      await navigator.clipboard.writeText(fullPrompt)
      setCopied(true)
    } catch {
      // Fallback for environments without clipboard API
      const ta = document.createElement('textarea')
      ta.value = fullPrompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
    }
  }

  const contextLabel =
    ctx.kind === 'movie'
      ? `Asking about ${ctx.title}${ctx.year ? ` (${ctx.year})` : ''}`
      : ctx.kind === 'series'
        ? `Asking about ${ctx.name}`
        : ctx.kind === 'explore'
          ? 'Query Builder mode'
          : ctx.kind === 'compare'
            ? 'Compare mode'
            : 'General analytics'

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-40 font-body">
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-text-primary text-bg-base shadow-lg hover:opacity-90 transition-opacity"
          aria-label="Ask AI"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
            <circle cx="19" cy="4" r="1" />
            <circle cx="5" cy="19" r="1.5" />
          </svg>
          <span className="text-sm font-medium">Ask AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="w-[min(96vw,420px)] max-h-[min(80vh,640px)] rounded-2xl bg-bg-base border border-border shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Ask AI about this data"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-text-primary text-lg leading-none">Ask AI</div>
              <div className="text-text-muted text-[11px] mt-1.5 truncate">{contextLabel}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-text-muted hover:text-text-primary transition-colors rounded"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Suggested questions */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-text-muted text-[10px] uppercase tracking-widest px-2 mb-2 font-medium">
              Suggested questions
            </div>
            <div className="space-y-1.5">
              {questions.map((q) => {
                const isActive = question === q.prompt
                return (
                  <button
                    key={q.label}
                    onClick={() => pickSuggestion(q.prompt)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm leading-snug transition-colors ${
                      isActive
                        ? 'bg-text-primary/10 text-text-primary border border-text-primary/30'
                        : 'bg-bg-surface text-text-secondary hover:text-text-primary hover:bg-bg-surface/70 border border-transparent'
                    }`}
                  >
                    {q.label}
                  </button>
                )
              })}
            </div>

            {/* Custom textbox */}
            <div className="mt-4">
              <div className="text-text-muted text-[10px] uppercase tracking-widest px-2 mb-2 font-medium">
                Or ask your own
              </div>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type a question about the data..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted/50 resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={hasQuestion ? claudeUrl(fullPrompt) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!hasQuestion}
                onClick={(e) => {
                  if (!hasQuestion) e.preventDefault()
                }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasQuestion
                    ? 'bg-text-primary text-bg-base hover:opacity-90'
                    : 'bg-bg-surface text-text-muted cursor-not-allowed'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 3 L20 3 L20 21 L4 21 Z M12 7 L7 17 L9 17 L10 14 L14 14 L15 17 L17 17 L12 7 Z M10.5 12 L12 8 L13.5 12 Z" />
                </svg>
                Open with Claude
              </a>
              <a
                href={hasQuestion ? chatgptUrl(fullPrompt) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!hasQuestion}
                onClick={(e) => {
                  if (!hasQuestion) e.preventDefault()
                }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasQuestion
                    ? 'bg-text-primary text-bg-base hover:opacity-90'
                    : 'bg-bg-surface text-text-muted cursor-not-allowed'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2 L20 7 L20 17 L12 22 L4 17 L4 7 Z M12 5 L7 8 L7 16 L12 19 L17 16 L17 8 Z" />
                </svg>
                Open with ChatGPT
              </a>
            </div>
            <button
              onClick={copyPrompt}
              disabled={!hasQuestion}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasQuestion
                  ? 'bg-bg-surface text-text-primary hover:bg-bg-surface/70 border border-border'
                  : 'bg-bg-surface text-text-muted cursor-not-allowed border border-border'
              }`}
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Prompt
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
