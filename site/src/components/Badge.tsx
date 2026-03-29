import type { TrailerType } from '../lib/types'
import { TRAILER_TYPE_CONFIG } from '../lib/constants'

export function TypeBadge({ type }: { type: TrailerType }) {
  const config = TRAILER_TYPE_CONFIG[type]
  if (!config) return null

  return (
    <span
      className="inline-block text-xs font-body font-medium px-2 py-0.5 rounded-full"
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
      }}
    >
      {config.label}
    </span>
  )
}

export function LanguageBadge({ language, flag }: { language: string; flag?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-body font-medium px-2 py-0.5 rounded-full bg-bg-overlay text-text-secondary">
      {flag && <span>{flag}</span>}
      {language}
    </span>
  )
}
