// localStorage keys
const WATCHLIST_KEY = 'tdb_watchlist'
const HISTORY_KEY = 'tdb_history'

// ---------------------------------------------------------------------------
// Watchlist: movies/series the user wants to watch trailers for
// ---------------------------------------------------------------------------

export function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addToWatchlist(id: string): void {
  const list = getWatchlist()
  if (!list.includes(id)) {
    list.push(id)
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list))
  }
}

export function removeFromWatchlist(id: string): void {
  const list = getWatchlist().filter((item) => item !== id)
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list))
}

export function isInWatchlist(id: string): boolean {
  return getWatchlist().includes(id)
}

export function clearWatchlist(): void {
  localStorage.removeItem(WATCHLIST_KEY)
}

// ---------------------------------------------------------------------------
// Watch history: trailers the user has played
// ---------------------------------------------------------------------------

export interface WatchHistoryEntry {
  youtube_id: string
  movie_id: string
  timestamp: number
}

export function getWatchHistory(): WatchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addToWatchHistory(youtube_id: string, movie_id: string): void {
  const history = getWatchHistory()
  // Remove any existing entry for this youtube_id so we don't duplicate
  const filtered = history.filter((h) => h.youtube_id !== youtube_id)
  filtered.unshift({ youtube_id, movie_id, timestamp: Date.now() })
  // Keep at most 200 entries
  if (filtered.length > 200) filtered.length = 200
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered))
}

export function clearWatchHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}
