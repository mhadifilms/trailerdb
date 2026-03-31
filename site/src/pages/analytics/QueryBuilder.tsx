import { useState, useMemo, useCallback, useTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryableTrailers, useAnalytics } from '../../lib/api'
import { executeQuery, type QueryConfig, type QueryResult } from '../../lib/query-engine'
import { QueryPanel } from '../../components/analytics/QueryPanel'
import { DataTable, type Column } from '../../components/analytics/DataTable'
import { BarChart } from '../../components/analytics/BarChart'
import { HeatmapGrid } from '../../components/analytics/HeatmapGrid'

/* ---------- helpers ---------- */

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/* ---------- Visualization types ---------- */

type VizMode = 'table' | 'bar' | 'heatmap'

/* ---------- Results rendering ---------- */

function ResultsTable({ result }: { result: QueryResult }) {
  const columns: Column<(string | number)[]>[] = useMemo(
    () =>
      result.columns.map((colName, colIdx) => ({
        header: colName,
        accessor: (row) => {
          const val = row[colIdx]
          if (typeof val === 'number') {
            if (colName === 'Engagement Rate') return `${val}%`
            if (colName === 'Avg Duration') {
              const m = Math.floor(val / 60)
              const s = Math.round(val % 60)
              return `${m}:${s.toString().padStart(2, '0')}`
            }
            return formatNum(val)
          }
          return String(val ?? '')
        },
        sortValue: (row) => {
          const val = row[colIdx]
          return typeof val === 'number' ? val : String(val ?? '')
        },
        align: (typeof result.rows[0]?.[colIdx] === 'number' ? 'right' : 'left') as 'left' | 'right',
      })),
    [result],
  )

  return (
    <DataTable
      columns={columns}
      data={result.rows}
      keyFn={(_, idx) => idx}
      pageSize={50}
    />
  )
}

function ResultsBarChart({ result }: { result: QueryResult }) {
  // Use first string column as label, first numeric column as value
  const labelIdx = result.columns.findIndex((_, i) =>
    result.rows.length > 0 && typeof result.rows[0]![i] === 'string'
  )
  const valueIdx = result.columns.findIndex((_, i) =>
    result.rows.length > 0 && typeof result.rows[0]![i] === 'number'
  )

  if (labelIdx < 0 || valueIdx < 0) {
    return <div className="text-text-muted font-body text-sm py-8 text-center">Cannot render bar chart with these dimensions.</div>
  }

  const items = result.rows.map((row) => ({
    label: String(row[labelIdx] ?? ''),
    value: typeof row[valueIdx] === 'number' ? row[valueIdx] : 0,
  }))

  const colName = result.columns[valueIdx]!
  const formatValue = (v: number) => {
    if (colName === 'Engagement Rate') return `${v}%`
    if (colName === 'Avg Duration') {
      const m = Math.floor(v / 60)
      const s = Math.round(v % 60)
      return `${m}:${s.toString().padStart(2, '0')}`
    }
    return formatNum(v)
  }

  return <BarChart items={items} formatValue={formatValue} />
}

function ResultsHeatmap({ result }: { result: QueryResult }) {
  // Need at least 2 group-by columns plus 1 value column
  const stringCols: number[] = []
  const numCols: number[] = []

  for (let i = 0; i < result.columns.length; i++) {
    if (result.rows.length > 0 && typeof result.rows[0]![i] === 'string') {
      stringCols.push(i)
    } else {
      numCols.push(i)
    }
  }

  if (stringCols.length < 2 || numCols.length < 1) {
    return (
      <div className="text-text-muted font-body text-sm py-8 text-center">
        Heatmap requires 2+ group-by dimensions and at least 1 measure.
      </div>
    )
  }

  const rowIdx = stringCols[0]!
  const colIdx = stringCols[1]!
  const valIdx = numCols[0]!

  // Build unique row/col labels
  const rowLabels = [...new Set(result.rows.map((r) => String(r[rowIdx])))]
  const colLabels = [...new Set(result.rows.map((r) => String(r[colIdx])))]

  // Build data grid
  const dataGrid: (number | null)[][] = rowLabels.map(() => colLabels.map(() => null))
  for (const row of result.rows) {
    const ri = rowLabels.indexOf(String(row[rowIdx]))
    const ci = colLabels.indexOf(String(row[colIdx]))
    if (ri >= 0 && ci >= 0) {
      dataGrid[ri]![ci] = typeof row[valIdx] === 'number' ? row[valIdx] : null
    }
  }

  return (
    <HeatmapGrid
      rows={rowLabels}
      cols={colLabels}
      data={dataGrid}
      colorScale={(value, max) => {
        const pct = max > 0 ? value / max : 0
        const intensity = Math.round(pct * 200)
        return `rgb(${255 - intensity}, ${255 - intensity}, ${255 - Math.round(intensity * 0.5)})`
      }}
      formatValue={formatNum}
      label={result.columns[valIdx]}
    />
  )
}

/* ---------- QueryBuilder main ---------- */

const DEFAULT_CONFIG: QueryConfig = {
  groupBy: ['Type'],
  measures: ['Count', 'Avg Views'],
  filters: [],
  sortBy: 'Count',
  sortDir: 'desc',
  limit: 25,
}

export function QueryBuilder() {
  const { data: queryableData, isLoading: dataLoading } = useQueryableTrailers()
  const [searchParams, setSearchParams] = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [vizMode, setVizMode] = useState<VizMode>('table')
  const [isPending, startTransition] = useTransition()

  // Initialize config from URL or defaults
  const [config, setConfig] = useState<QueryConfig>(() => {
    const urlGroupBy = searchParams.get('gb')
    const urlMeasures = searchParams.get('ms')
    const urlSort = searchParams.get('sb')
    const urlSortDir = searchParams.get('sd')
    const urlLimit = searchParams.get('lm')

    return {
      groupBy: urlGroupBy ? urlGroupBy.split(',') : DEFAULT_CONFIG.groupBy,
      measures: urlMeasures ? urlMeasures.split(',') : DEFAULT_CONFIG.measures,
      filters: DEFAULT_CONFIG.filters,
      sortBy: urlSort || DEFAULT_CONFIG.sortBy,
      sortDir: (urlSortDir as 'asc' | 'desc') || DEFAULT_CONFIG.sortDir,
      limit: urlLimit ? Number(urlLimit) : DEFAULT_CONFIG.limit,
    }
  })

  // Execute query
  const result = useMemo<QueryResult | null>(() => {
    if (!queryableData) return null
    return executeQuery(queryableData, config)
  }, [queryableData, config])

  // Sync to URL
  const handleConfigChange = useCallback(
    (newConfig: QueryConfig) => {
      startTransition(() => {
        setConfig(newConfig)
        const params: Record<string, string> = { mode: 'explore' }
        if (newConfig.groupBy.length > 0) params.gb = newConfig.groupBy.join(',')
        if (newConfig.measures.length > 0) params.ms = newConfig.measures.join(',')
        if (newConfig.sortBy) params.sb = newConfig.sortBy
        if (newConfig.sortDir) params.sd = newConfig.sortDir
        if (newConfig.limit !== 25) params.lm = String(newConfig.limit)
        setSearchParams(params, { replace: true })
      })
    },
    [setSearchParams],
  )

  // Check if heatmap is available
  const canShowHeatmap = config.groupBy.length >= 2

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 rounded-xl w-48" />
        <div className="skeleton h-60 rounded-xl" />
      </div>
    )
  }

  if (!queryableData) {
    return (
      <div className="text-center py-20">
        <h2 className="font-display text-text-primary text-2xl mb-3">Data not available</h2>
        <p className="text-text-muted font-body">The queryable dataset is still being generated. Check back soon.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Left: Query panel */}
      <QueryPanel
        config={config}
        onConfigChange={handleConfigChange}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {/* Viz toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-body text-text-muted">
            {result ? `${result.rows.length} results from ${queryableData.length.toLocaleString()} trailers` : ''}
          </div>
          <div className="flex gap-1">
            {(['table', 'bar', ...(canShowHeatmap ? ['heatmap' as const] : [])] as VizMode[]).map(
              (mode) => (
                <button
                  key={mode}
                  onClick={() => setVizMode(mode)}
                  className={`px-3 py-1 rounded-full text-xs font-body font-medium transition-all cursor-pointer capitalize ${
                    vizMode === mode
                      ? 'bg-text-primary text-bg-base'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-surface'
                  }`}
                >
                  {mode === 'bar' ? 'Bar Chart' : mode}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Loading overlay */}
        {isPending && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm font-body text-text-muted">Processing...</div>
          </div>
        )}

        {/* Results */}
        {result && !isPending && (
          <>
            {result.rows.length === 0 ? (
              <div className="text-center py-16 rounded-xl bg-bg-surface border border-border">
                <div className="font-display text-text-primary text-xl mb-2">No results</div>
                <p className="text-text-muted font-body text-sm">
                  Try adjusting your filters or group-by dimensions.
                </p>
              </div>
            ) : (
              <>
                {vizMode === 'table' && <ResultsTable result={result} />}
                {vizMode === 'bar' && <ResultsBarChart result={result} />}
                {vizMode === 'heatmap' && <ResultsHeatmap result={result} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
