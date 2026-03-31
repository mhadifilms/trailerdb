import { useState } from 'react'
import { DIMENSIONS, MEASURES } from '../../lib/query-engine'
import type { QueryConfig, QueryFilter, Dimension, Measure } from '../../lib/query-engine'
import { FilterRow } from './FilterRow'

interface QueryPanelProps {
  config: QueryConfig
  onConfigChange: (config: QueryConfig) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function ChipGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: readonly string[]
  selected: string[]
  onToggle: (item: string) => void
}) {
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-widest text-text-muted font-body font-medium mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isActive = selected.includes(item)
          return (
            <button
              key={item}
              onClick={() => onToggle(item)}
              className={`px-2.5 py-1 rounded-full text-xs font-body font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-text-primary text-bg-base'
                  : 'bg-bg-surface text-text-secondary border border-border hover:border-text-muted/50 hover:text-text-primary'
              }`}
            >
              {item}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function QueryPanel({ config, onConfigChange, collapsed, onToggleCollapse }: QueryPanelProps) {
  function toggleGroupBy(dim: string) {
    const next = config.groupBy.includes(dim)
      ? config.groupBy.filter((d) => d !== dim)
      : [...config.groupBy, dim]
    onConfigChange({ ...config, groupBy: next })
  }

  function toggleMeasure(measure: string) {
    const next = config.measures.includes(measure)
      ? config.measures.filter((m) => m !== measure)
      : [...config.measures, measure]
    onConfigChange({ ...config, measures: next })
  }

  function updateFilter(index: number, filter: QueryFilter) {
    const next = [...config.filters]
    next[index] = filter
    onConfigChange({ ...config, filters: next })
  }

  function removeFilter(index: number) {
    const next = config.filters.filter((_, i) => i !== index)
    onConfigChange({ ...config, filters: next })
  }

  function addFilter() {
    onConfigChange({
      ...config,
      filters: [...config.filters, { dim: 'Year', op: '=', val: '' }],
    })
  }

  // Available sort columns
  const sortColumns = [...config.groupBy, ...(config.measures.length > 0 ? config.measures : ['Count'])]

  return (
    <div className={`${collapsed ? 'w-10' : 'w-72'} shrink-0 transition-all duration-200`}>
      {/* Collapse toggle */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary text-xs font-body font-medium mb-3 cursor-pointer transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!collapsed && 'Configuration'}
        </button>
      )}

      {!collapsed && (
        <div className="space-y-0">
          <ChipGroup
            label="Group By"
            items={DIMENSIONS}
            selected={config.groupBy}
            onToggle={toggleGroupBy}
          />

          <ChipGroup
            label="Measures"
            items={MEASURES}
            selected={config.measures}
            onToggle={toggleMeasure}
          />

          {/* Filters */}
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-body font-medium mb-2">
              Filters
            </div>
            <div className="space-y-2">
              {config.filters.map((f, i) => (
                <FilterRow
                  key={i}
                  filter={f}
                  index={i}
                  onChange={updateFilter}
                  onRemove={removeFilter}
                />
              ))}
            </div>
            <button
              onClick={addFilter}
              className="mt-2 text-xs font-body font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              + Add Filter
            </button>
          </div>

          {/* Sort */}
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-body font-medium mb-2">
              Sort
            </div>
            <div className="flex items-center gap-2">
              <select
                value={config.sortBy}
                onChange={(e) => onConfigChange({ ...config, sortBy: e.target.value })}
                className="flex-1 px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body text-text-primary focus:outline-none focus:border-text-muted/50 cursor-pointer"
              >
                {sortColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  onConfigChange({
                    ...config,
                    sortDir: config.sortDir === 'asc' ? 'desc' : 'asc',
                  })
                }
                className="px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body font-medium text-text-primary hover:border-text-muted/50 transition-colors cursor-pointer"
              >
                {config.sortDir === 'asc' ? '\u2191 ASC' : '\u2193 DESC'}
              </button>
            </div>
          </div>

          {/* Limit */}
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-body font-medium mb-2">
              Limit
            </div>
            <select
              value={config.limit}
              onChange={(e) => onConfigChange({ ...config, limit: Number(e.target.value) })}
              className="px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body text-text-primary focus:outline-none focus:border-text-muted/50 cursor-pointer"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} rows
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
