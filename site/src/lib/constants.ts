import type { TrailerType } from './types'

export const TRAILER_TYPE_CONFIG: Record<TrailerType, { label: string; color: string }> = {
  trailer: { label: 'Trailer', color: 'var(--color-type-trailer)' },
  teaser: { label: 'Teaser', color: 'var(--color-type-teaser)' },
  clip: { label: 'Clip', color: 'var(--color-type-clip)' },
  featurette: { label: 'Featurette', color: 'var(--color-type-featurette)' },
  behind_the_scenes: { label: 'Behind the Scenes', color: 'var(--color-type-bts)' },
  bloopers: { label: 'Bloopers', color: 'var(--color-type-bloopers)' },
  tv_spot: { label: 'TV Spot', color: 'var(--color-type-tv-spot)' },
  red_band: { label: 'Red Band', color: 'var(--color-type-red-band)' },
  imax: { label: 'IMAX', color: 'var(--color-type-imax)' },
}

export const TRAILER_TYPE_ORDER: TrailerType[] = [
  'trailer', 'teaser', 'tv_spot', 'red_band', 'imax',
  'clip', 'featurette', 'behind_the_scenes', 'bloopers',
]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  ja: 'Japanese', pt: 'Portuguese', ko: 'Korean', zh: 'Chinese',
  it: 'Italian', ru: 'Russian', hi: 'Hindi', ar: 'Arabic',
  nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
  da: 'Danish', no: 'Norwegian', fi: 'Finnish', cs: 'Czech',
  hu: 'Hungarian', ro: 'Romanian', th: 'Thai', id: 'Indonesian',
  vi: 'Vietnamese', uk: 'Ukrainian', el: 'Greek', he: 'Hebrew',
  ms: 'Malay', tl: 'Filipino',
}

export const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  ja: '🇯🇵', pt: '🇧🇷', ko: '🇰🇷', zh: '🇨🇳',
  it: '🇮🇹', ru: '🇷🇺', hi: '🇮🇳', ar: '🇸🇦',
  nl: '🇳🇱', pl: '🇵🇱', tr: '🇹🇷', sv: '🇸🇪',
  da: '🇩🇰', no: '🇳🇴', fi: '🇫🇮', cs: '🇨🇿',
  hu: '🇭🇺', ro: '🇷🇴', th: '🇹🇭', id: '🇮🇩',
  vi: '🇻🇳', uk: '🇺🇦', el: '🇬🇷', he: '🇮🇱',
  ms: '🇲🇾', tl: '🇵🇭',
}
