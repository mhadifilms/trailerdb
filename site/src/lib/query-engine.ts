import * as aq from 'arquero'
import type { QueryableTrailer } from './types'

export interface QueryFilter {
  dim: string
  op: string
  val: string
}

export interface QueryConfig {
  groupBy: string[]
  measures: string[]
  filters: QueryFilter[]
  sortBy: string
  sortDir: 'asc' | 'desc'
  limit: number
}

// Maps UI dimension names to QueryableTrailer field keys
const DIM_MAP: Record<string, string> = {
  Genre: 'g',
  Year: 'y',
  Language: 'l',
  Type: 't',
  Channel: 'ch',
  Official: 'o',
  Decade: 'y',
}

export const DIMENSIONS = ['Genre', 'Year', 'Decade', 'Language', 'Type', 'Channel', 'Official'] as const
export const MEASURES = [
  'Count',
  'Total Views',
  'Avg Views',
  'Total Likes',
  'Avg Likes',
  'Engagement Rate',
  'Avg Duration',
] as const

export type Dimension = (typeof DIMENSIONS)[number]
export type Measure = (typeof MEASURES)[number]

export interface QueryResult {
  columns: string[]
  rows: (string | number)[][]
}

function applyFilter(
  items: QueryableTrailer[],
  filter: QueryFilter,
): QueryableTrailer[] {
  const field = DIM_MAP[filter.dim]
  if (!field) return items

  return items.filter((row) => {
    const rawVal = (row as any)[field]

    // Genre is an array
    if (filter.dim === 'Genre') {
      const numVal = Number(filter.val)
      if (isNaN(numVal)) return true
      const arr = rawVal as number[]
      if (filter.op === '=') return arr.includes(numVal)
      if (filter.op === '!=') return !arr.includes(numVal)
      return true
    }

    // Decade special
    if (filter.dim === 'Decade') {
      if (rawVal == null) return false
      const decade = Math.floor((rawVal as number) / 10) * 10
      const target = Number(filter.val)
      if (filter.op === '=') return decade === target
      if (filter.op === '!=') return decade !== target
      if (filter.op === '>') return decade > target
      if (filter.op === '<') return decade < target
      if (filter.op === '>=') return decade >= target
      if (filter.op === '<=') return decade <= target
      return true
    }

    // Numeric fields
    if (typeof rawVal === 'number' || rawVal == null) {
      const numTarget = Number(filter.val)
      const numVal = rawVal as number | null
      if (numVal == null) return filter.op === '!=' // null != anything is true
      if (filter.op === '=') return numVal === numTarget
      if (filter.op === '!=') return numVal !== numTarget
      if (filter.op === '>') return numVal > numTarget
      if (filter.op === '<') return numVal < numTarget
      if (filter.op === '>=') return numVal >= numTarget
      if (filter.op === '<=') return numVal <= numTarget
      return true
    }

    // String fields
    const strVal = String(rawVal ?? '')
    const target = filter.val.toLowerCase()
    if (filter.op === '=') return strVal.toLowerCase() === target
    if (filter.op === '!=') return strVal.toLowerCase() !== target
    if (filter.op === 'contains') return strVal.toLowerCase().includes(target)
    return true
  })
}

function getGroupKey(
  row: QueryableTrailer,
  dim: string,
): string {
  if (dim === 'Decade') {
    const y = row.y
    if (y == null) return 'Unknown'
    return `${Math.floor(y / 10) * 10}s`
  }
  if (dim === 'Genre') {
    // Genre grouping produces multiple entries per row; handled in executeQuery
    return ''
  }
  if (dim === 'Official') {
    return row.o === 1 ? 'Official' : 'Unofficial'
  }
  const field = DIM_MAP[dim]
  if (!field) return 'Unknown'
  const val = (row as any)[field]
  if (val == null) return 'Unknown'
  return String(val)
}

interface GroupBucket {
  rows: QueryableTrailer[]
  keys: Record<string, string>
}

function buildGroups(
  data: QueryableTrailer[],
  groupBy: string[],
): GroupBucket[] {
  if (groupBy.length === 0) {
    return [{ rows: data, keys: {} }]
  }

  const bucketMap = new Map<string, GroupBucket>()

  for (const row of data) {
    // Genre dimension produces multiple key combos per row
    const hasGenre = groupBy.includes('Genre')
    const genres = hasGenre ? (row.g.length > 0 ? row.g.map(String) : ['Unknown']) : ['']
    const otherKeys: Record<string, string> = {}
    for (const dim of groupBy) {
      if (dim !== 'Genre') {
        otherKeys[dim] = getGroupKey(row, dim)
      }
    }

    for (const genreKey of genres) {
      const keys: Record<string, string> = { ...otherKeys }
      if (hasGenre) keys['Genre'] = genreKey

      const compositeKey = groupBy.map((d) => keys[d]).join('|||')
      let bucket = bucketMap.get(compositeKey)
      if (!bucket) {
        bucket = { rows: [], keys }
        bucketMap.set(compositeKey, bucket)
      }
      bucket.rows.push(row)
    }
  }

  return Array.from(bucketMap.values())
}

function computeMeasure(rows: QueryableTrailer[], measure: string): number {
  switch (measure) {
    case 'Count':
      return rows.length
    case 'Total Views':
      return rows.reduce((s, r) => s + (r.v ?? 0), 0)
    case 'Avg Views': {
      const withViews = rows.filter((r) => r.v != null)
      if (withViews.length === 0) return 0
      return Math.round(withViews.reduce((s, r) => s + (r.v ?? 0), 0) / withViews.length)
    }
    case 'Total Likes':
      return rows.reduce((s, r) => s + (r.lk ?? 0), 0)
    case 'Avg Likes': {
      const withLikes = rows.filter((r) => r.lk != null)
      if (withLikes.length === 0) return 0
      return Math.round(withLikes.reduce((s, r) => s + (r.lk ?? 0), 0) / withLikes.length)
    }
    case 'Engagement Rate': {
      const totalViews = rows.reduce((s, r) => s + (r.v ?? 0), 0)
      const totalLikes = rows.reduce((s, r) => s + (r.lk ?? 0), 0)
      if (totalViews === 0) return 0
      return Number(((totalLikes / totalViews) * 100).toFixed(3))
    }
    case 'Avg Duration': {
      const withDur = rows.filter((r) => r.d != null)
      if (withDur.length === 0) return 0
      return Math.round(withDur.reduce((s, r) => s + (r.d ?? 0), 0) / withDur.length)
    }
    default:
      return 0
  }
}

export function executeQuery(
  data: QueryableTrailer[],
  config: QueryConfig,
): QueryResult {
  // 1. Apply filters
  let filtered = data
  for (const f of config.filters) {
    filtered = applyFilter(filtered, f)
  }

  // 2. Group
  const groups = buildGroups(filtered, config.groupBy)

  // 3. Aggregate
  const measures = config.measures.length > 0 ? config.measures : ['Count']
  const columns = [...config.groupBy, ...measures]

  let rows: (string | number)[][] = groups.map((bucket) => {
    const keyVals = config.groupBy.map((d) => bucket.keys[d] ?? 'Unknown')
    const measureVals = measures.map((m) => computeMeasure(bucket.rows, m))
    return [...keyVals, ...measureVals]
  })

  // 4. Sort
  const sortIdx = columns.indexOf(config.sortBy)
  if (sortIdx >= 0) {
    rows.sort((a, b) => {
      const av = a[sortIdx]!
      const bv = b[sortIdx]!
      if (typeof av === 'number' && typeof bv === 'number') {
        return config.sortDir === 'asc' ? av - bv : bv - av
      }
      return config.sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }

  // 5. Limit
  rows = rows.slice(0, config.limit)

  return { columns, rows }
}

export function getFilterOperators(dim: string): string[] {
  if (dim === 'Genre') return ['=', '!=']
  if (['Year', 'Decade'].includes(dim)) return ['=', '!=', '>', '<', '>=', '<=']
  if (['Language', 'Type', 'Channel'].includes(dim)) return ['=', '!=', 'contains']
  if (dim === 'Official') return ['=', '!=']
  return ['=', '!=']
}
