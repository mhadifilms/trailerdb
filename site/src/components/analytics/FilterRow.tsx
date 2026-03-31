import { DIMENSIONS, getFilterOperators } from '../../lib/query-engine'
import type { QueryFilter } from '../../lib/query-engine'

interface FilterRowProps {
  filter: QueryFilter
  index: number
  onChange: (index: number, filter: QueryFilter) => void
  onRemove: (index: number) => void
}

export function FilterRow({ filter, index, onChange, onRemove }: FilterRowProps) {
  const operators = getFilterOperators(filter.dim)

  return (
    <div className="flex items-center gap-1.5">
      {/* Dimension */}
      <select
        value={filter.dim}
        onChange={(e) => onChange(index, { ...filter, dim: e.target.value, op: '=', val: '' })}
        className="w-24 px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body text-text-primary focus:outline-none focus:border-text-muted/50 cursor-pointer"
      >
        {DIMENSIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={filter.op}
        onChange={(e) => onChange(index, { ...filter, op: e.target.value })}
        className="w-16 px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body text-text-primary focus:outline-none focus:border-text-muted/50 cursor-pointer"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      {/* Value */}
      <input
        type="text"
        value={filter.val}
        onChange={(e) => onChange(index, { ...filter, val: e.target.value })}
        placeholder="value"
        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-bg-surface border border-border text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted/50"
      />

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-text-muted/50 transition-colors cursor-pointer"
        aria-label="Remove filter"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
