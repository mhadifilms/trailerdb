import type { Trailer } from '../lib/types'
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../lib/constants'

interface LanguageTabsProps {
  trailers: Trailer[]
  activeLanguage: string | null
  onLanguageChange: (lang: string | null) => void
}

export function LanguageTabs({ trailers, activeLanguage, onLanguageChange }: LanguageTabsProps) {
  // Count trailers per language
  const langCounts = new Map<string, number>()
  for (const t of trailers) {
    if (t.language) {
      langCounts.set(t.language, (langCounts.get(t.language) || 0) + 1)
    }
  }

  // Only show tabs if there are multiple languages
  if (langCounts.size <= 1) return null

  // Sort: most trailers first
  const languages = [...langCounts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-2 mb-6" role="tablist">
      <button
        role="tab"
        aria-selected={activeLanguage === null}
        onClick={() => onLanguageChange(null)}
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-body font-medium transition-all cursor-pointer ${
          activeLanguage === null
            ? 'bg-accent text-bg-base'
            : 'bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }`}
      >
        All ({trailers.length})
      </button>
      {languages.map(([lang, count]) => {
        const flag = LANGUAGE_FLAGS[lang] || ''
        const name = LANGUAGE_NAMES[lang] || lang.toUpperCase()
        const isActive = activeLanguage === lang

        return (
          <button
            key={lang}
            role="tab"
            aria-selected={isActive}
            onClick={() => onLanguageChange(lang)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-body font-medium transition-all cursor-pointer ${
              isActive
                ? 'bg-accent text-bg-base'
                : 'bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            {flag} {name} ({count})
          </button>
        )
      })}
    </div>
  )
}
