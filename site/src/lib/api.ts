import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { MovieDetail, GenreMeta, SiteStats, BrowseIndex } from './types'
import { parseIndex, parseShard } from './utils'

const BASE = import.meta.env.BASE_URL + 'data'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json()
}

/** Fetch the full browse index (Tier 1) */
export function useBrowseIndex() {
  return useQuery({
    queryKey: ['browse-index'],
    queryFn: async () => {
      const raw = await fetchJson<BrowseIndex>('index.json')
      return parseIndex(raw)
    },
  })
}

/** Fetch a movie detail file (Tier 3) */
export function useMovieDetail(imdbId: string | null) {
  return useQuery({
    queryKey: ['movie', imdbId],
    queryFn: () => fetchJson<MovieDetail>(`movie/${imdbId}.json`),
    enabled: !!imdbId,
  })
}

/** Fetch a browse shard (Tier 2) */
export function useBrowseShard(path: string) {
  return useQuery({
    queryKey: ['shard', path],
    queryFn: async () => {
      const raw = await fetchJson<(string | number | number[] | null)[][]>(`browse/${path}`)
      return parseShard(raw)
    },
  })
}

/** Fetch genre metadata */
export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: () => fetchJson<GenreMeta[]>('browse/genres.json'),
  })
}

/** Fetch site stats */
export function useSiteStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => fetchJson<SiteStats>('stats.json'),
  })
}

/** Prefetch a movie detail (for hover prefetching) */
export function prefetchMovie(imdbId: string, queryClient: QueryClient) {
  queryClient.prefetchQuery({
    queryKey: ['movie', imdbId],
    queryFn: () => fetchJson<MovieDetail>(`movie/${imdbId}.json`),
  })
}
