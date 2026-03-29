import { useState, useCallback, useRef, useEffect } from 'react'

interface CodeBlockProps {
  code: string
  language: 'python' | 'javascript' | 'bash' | 'json' | 'text'
  title?: string
}

/** Simple regex-based syntax highlighting */
function highlight(code: string, language: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const escaped = esc(code)

  if (language === 'json') {
    return escaped
      // strings
      .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="text-type-trailer">$1</span>:')
      .replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':$1<span class="text-rating-green">$2</span>')
      .replace(/(?<![:\w])("(?:[^"\\]|\\.)*")(?!\s*:)/g, '<span class="text-rating-green">$1</span>')
      // numbers
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-accent">$1</span>')
      // booleans and null
      .replace(/\b(true|false|null)\b/g, '<span class="text-type-teaser">$1</span>')
  }

  if (language === 'python') {
    return escaped
      // comments
      .replace(/(#.*)/g, '<span class="text-text-muted">$1</span>')
      // strings (double and single)
      .replace(/(f?"(?:[^"\\]|\\.)*"|f?'(?:[^'\\]|\\.)*')/g, '<span class="text-rating-green">$1</span>')
      // keywords
      .replace(/\b(import|from|as|def|class|return|if|else|elif|for|in|while|with|try|except|finally|raise|and|or|not|is|None|True|False|print|async|await)\b/g, '<span class="text-type-teaser">$1</span>')
      // built-in functions
      .replace(/\b(print|len|range|enumerate|zip|map|filter|sorted|list|dict|set|tuple|int|float|str|bool|type)\b(?=\s*\()/g, '<span class="text-type-trailer">$1</span>')
      // numbers
      .replace(/(?<!["\w])(\d+\.?\d*)(?!["\w])/g, '<span class="text-accent">$1</span>')
  }

  if (language === 'javascript') {
    return escaped
      // comments
      .replace(/(\/\/.*)/g, '<span class="text-text-muted">$1</span>')
      // template literals (backtick strings)
      .replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="text-rating-green">$1</span>')
      // strings
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="text-rating-green">$1</span>')
      // keywords
      .replace(/\b(const|let|var|function|return|if|else|for|while|of|in|new|this|class|import|from|export|default|async|await|try|catch|throw|typeof|instanceof)\b/g, '<span class="text-type-teaser">$1</span>')
      // built-in
      .replace(/\b(console|fetch|JSON|Promise|Array|Object|Math|document|window)\b/g, '<span class="text-type-trailer">$1</span>')
      // numbers
      .replace(/(?<!["\w])(\d+\.?\d*)(?!["\w])/g, '<span class="text-accent">$1</span>')
  }

  if (language === 'bash') {
    return escaped
      // comments
      .replace(/(#.*)/g, '<span class="text-text-muted">$1</span>')
      // strings
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="text-rating-green">$1</span>')
      // commands at start
      .replace(/^(\s*)(curl|pip|trailerdb|python|node|npm|npx|wget|jq|cat|echo)/gm, '$1<span class="text-type-trailer">$2</span>')
      // flags
      .replace(/(\s)(--?\w[\w-]*)/g, '$1<span class="text-type-teaser">$2</span>')
      // pipe and redirect
      .replace(/(\||&gt;|&lt;|&amp;&amp;)/g, '<span class="text-accent">$1</span>')
  }

  return escaped
}

const langLabels: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  bash: 'Shell',
  json: 'JSON',
  text: 'Text',
}

export function CodeBlock({ code, language, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const highlighted = highlight(code, language)

  return (
    <div className="group relative rounded-lg border border-border overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-overlay border-b border-border">
        <span className="text-xs font-body text-text-muted uppercase tracking-wider">
          {title || langLabels[language] || language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-body text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-rating-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-rating-green">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code */}
      <pre className="bg-bg-void p-4 overflow-x-auto">
        <code
          className="text-sm font-mono leading-relaxed text-text-secondary"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  )
}
