import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMovieDetail } from '../../lib/api'
import {
  suggestedQuestions,
  buildPrompt,
  apiQueryUrl,
  claudeUrl,
  chatgptUrl,
  type QuestionContext,
  type SuggestedQuestion,
} from '../../lib/ai-prompts'

/** Cap inlined data to ~12KB so URLs stay reasonable for claude.ai/chatgpt.com prefill. */
const MAX_DATA_BYTES = 12_000

async function runSql(sql: string): Promise<string | null> {
  try {
    const resp = await fetch(apiQueryUrl(sql))
    if (!resp.ok) return null
    const data = await resp.json()
    if (!data.success) return null
    const compact = { columns: data.columns, rows: data.rows, count: data.count }
    let json = JSON.stringify(compact, null, 2)
    if (json.length > MAX_DATA_BYTES) {
      // Trim rows until under cap
      const trimmed = { ...compact, rows: compact.rows.slice(0, 30), truncated: true }
      json = JSON.stringify(trimmed, null, 2)
    }
    return json
  } catch {
    return null
  }
}

/* ---------- brand glyphs ---------- */

function ClaudeGlyph({ className = '' }: { className?: string }) {
  // Anthropic "starburst" mark, simplified to fit at small sizes.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M5.5 16.6L9.9 4.2c.1-.3.4-.5.7-.5h2.7c.3 0 .6.2.7.5l4.4 12.4c.1.3-.1.6-.4.6h-2.1c-.2 0-.4-.1-.5-.3l-.9-2.6h-5l-.9 2.6c-.1.2-.3.3-.5.3H5.9c-.3 0-.5-.3-.4-.6zm5-3.6h3l-1.5-4.3-1.5 4.3z" />
      <circle cx="20" cy="20" r="1.4" />
    </svg>
  )
}

function ChatGPTGlyph({ className = '' }: { className?: string }) {
  // OpenAI knot mark — recognizable interlocking trefoil
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M22.28 9.82a5.95 5.95 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.99 5.99 0 0 0-4 2.9 6.06 6.06 0 0 0 .74 7.1 5.96 5.96 0 0 0 .5 4.91 6.05 6.05 0 0 0 6.51 2.9 5.99 5.99 0 0 0 4.51 2.02 6.06 6.06 0 0 0 5.78-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.08zm-9.06 12.67a4.49 4.49 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.55 18.09a4.47 4.47 0 0 1-.54-3.02l.14.08 4.79 2.76a.78.78 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79a4.5 4.5 0 0 1-6.14-1.63zM2.3 7.97a4.48 4.48 0 0 1 2.34-1.97v5.69a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.91 14.1a4.5 4.5 0 0 1-1.61-6.13zm16.61 3.86l-5.84-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.84 2.79a4.5 4.5 0 0 1-.68 8.13v-5.69a.79.79 0 0 0-.41-.68zm2.01-3.04l-.14-.09-4.78-2.78a.78.78 0 0 0-.79 0L9.37 9.3V6.97a.07.07 0 0 1 .03-.06l4.84-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.27 12.96l-2.02-1.16a.08.08 0 0 1-.04-.06V6.16a4.5 4.5 0 0 1 7.38-3.46l-.14.08L8.66 5.55a.79.79 0 0 0-.39.68zm1.1-2.36L11.97 9.1l2.61 1.5v3l-2.6 1.5-2.61-1.5z" />
    </svg>
  )
}

function CopyGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function SparkGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2L13.6 8.4L20 10L13.6 11.6L12 18L10.4 11.6L4 10L10.4 8.4L12 2Z" />
      <path d="M19 3L19.6 5.4L22 6L19.6 6.6L19 9L18.4 6.6L16 6L18.4 5.4L19 3Z" opacity=".7" />
      <path d="M5 16L5.6 18.4L8 19L5.6 19.6L5 22L4.4 19.6L2 19L4.4 18.4L5 16Z" opacity=".55" />
    </svg>
  )
}

/* ---------- main component ---------- */

export function AIAskPanel() {
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [activeSql, setActiveSql] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [dataJson, setDataJson] = useState<string | null>(null)
  const [dataError, setDataError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const movieId = searchParams.get('movie')
  const seriesId = searchParams.get('series')
  const mode = searchParams.get('mode')

  const { data: movie } = useMovieDetail(movieId)

  const ctx: QuestionContext = useMemo(() => {
    if (movieId && movie) return { kind: 'movie', imdbId: movieId, title: movie.title, year: movie.year }
    if (movieId) return { kind: 'movie', imdbId: movieId, title: 'this movie' }
    if (seriesId) return { kind: 'series', tmdbId: seriesId, name: 'this series' }
    if (mode === 'explore') return { kind: 'explore' }
    if (mode === 'compare') return { kind: 'compare' }
    return { kind: 'dashboard' }
  }, [movieId, movie, seriesId, mode])

  const questions = useMemo(() => suggestedQuestions(ctx), [ctx])

  // ESC + outside click
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  // Reset copy flag
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const activeQuestion = question.trim()
  const hasQuestion = activeQuestion.length > 0
  const fullPrompt = hasQuestion ? buildPrompt(activeQuestion, dataJson) : ''

  // Reset data when question changes (and the new question doesn't match the SQL we just fetched)
  function pickSuggestion(q: SuggestedQuestion) {
    setQuestion(q.prompt)
    if (q.sql && q.sql !== activeSql) {
      setActiveSql(q.sql)
      setDataJson(null)
      setDataError(false)
      setLoadingData(true)
      runSql(q.sql).then((json) => {
        setLoadingData(false)
        if (json) setDataJson(json)
        else setDataError(true)
      })
    } else if (!q.sql) {
      setActiveSql(null)
      setDataJson(null)
      setDataError(false)
      setLoadingData(false)
    }
  }

  function setCustomQuestion(text: string) {
    setQuestion(text)
    // Custom questions don't get pre-fetched data
    setActiveSql(null)
    setDataJson(null)
    setDataError(false)
    setLoadingData(false)
  }

  async function copyPrompt() {
    if (!hasQuestion) return
    try {
      await navigator.clipboard.writeText(fullPrompt)
      setCopied(true)
    } catch {
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
      ? `${ctx.title}${ctx.year ? ` · ${ctx.year}` : ''}`
      : ctx.kind === 'series'
        ? ctx.name
        : ctx.kind === 'explore'
          ? 'Explore mode'
          : ctx.kind === 'compare'
            ? 'Compare mode'
            : 'Trailer database'

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-40 font-body">
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full bg-text-primary text-bg-base shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.22)] hover:-translate-y-0.5 transition-all duration-200"
          aria-label="Ask AI"
        >
          <SparkGlyph className="w-4 h-4" />
          <span className="text-[13px] font-medium tracking-tight">Ask AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="w-[min(96vw,440px)] max-h-[min(82vh,680px)] rounded-2xl bg-bg-base border border-border shadow-[0_20px_50px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden backdrop-blur-sm"
          role="dialog"
          aria-label="Ask AI about this data"
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-border/70">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-text-primary text-bg-base">
                  <SparkGlyph className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-text-primary text-[15px] leading-none tracking-tight">Ask AI</div>
                  <div className="text-text-muted text-[10.5px] mt-1 truncate uppercase tracking-widest">{contextLabel}</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 -mr-1 text-text-muted hover:text-text-primary transition-colors rounded"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Suggested questions */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-text-muted text-[10px] uppercase tracking-[0.18em] px-2 mb-2 font-medium">
              Suggested
            </div>
            <div className="space-y-1">
              {questions.map((q) => {
                const isActive = question === q.prompt
                return (
                  <button
                    key={q.label}
                    onClick={() => pickSuggestion(q)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] leading-snug transition-all ${
                      isActive
                        ? 'bg-text-primary/[0.07] text-text-primary ring-1 ring-text-primary/20'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                    }`}
                  >
                    {q.label}
                  </button>
                )
              })}
            </div>

            {/* Custom textbox */}
            <div className="mt-5">
              <div className="text-text-muted text-[10px] uppercase tracking-[0.18em] px-2 mb-2 font-medium">
                Or write your own
              </div>
              <textarea
                value={question}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="Ask anything about the data…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-surface border border-border text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-text-primary/15 focus:border-text-primary/30 resize-none transition-all"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 py-3 border-t border-border/70 bg-bg-surface/40">
            {(loadingData || dataJson || dataError) && (
              <div className="px-2 pb-2 text-[11px] font-body flex items-center gap-2">
                {loadingData && (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-text-primary/60 animate-pulse" />
                    <span className="text-text-muted">Querying database…</span>
                  </>
                )}
                {!loadingData && dataJson && (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-text-muted">Live data attached ({(new Blob([dataJson]).size / 1024).toFixed(1)} KB)</span>
                  </>
                )}
                {!loadingData && dataError && (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-text-muted">Query failed — sending without data</span>
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={hasQuestion ? claudeUrl(fullPrompt) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!hasQuestion}
                onClick={(e) => { if (!hasQuestion) e.preventDefault() }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12.5px] font-medium transition-all ${
                  hasQuestion
                    ? 'bg-[#cc785c] text-white hover:bg-[#b86a51] hover:-translate-y-px shadow-sm'
                    : 'bg-bg-surface text-text-muted cursor-not-allowed border border-border'
                }`}
              >
                <ClaudeGlyph className="w-4 h-4" />
                Open in Claude
              </a>
              <a
                href={hasQuestion ? chatgptUrl(fullPrompt) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!hasQuestion}
                onClick={(e) => { if (!hasQuestion) e.preventDefault() }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12.5px] font-medium transition-all ${
                  hasQuestion
                    ? 'bg-[#10a37f] text-white hover:bg-[#0e8c6c] hover:-translate-y-px shadow-sm'
                    : 'bg-bg-surface text-text-muted cursor-not-allowed border border-border'
                }`}
              >
                <ChatGPTGlyph className="w-4 h-4" />
                Open in ChatGPT
              </a>
            </div>
            <button
              onClick={copyPrompt}
              disabled={!hasQuestion}
              className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all ${
                hasQuestion
                  ? 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                  : 'text-text-muted cursor-not-allowed'
              }`}
            >
              {copied ? <CheckGlyph className="w-3.5 h-3.5" /> : <CopyGlyph className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
