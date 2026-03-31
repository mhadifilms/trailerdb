import { useState, useMemo } from 'react'

export interface Column<T> {
  header: string
  accessor: (row: T) => string | number | React.ReactNode
  sortValue?: (row: T) => number | string
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  sortable?: boolean
  pageSize?: number
  keyFn?: (row: T, index: number) => string | number
}

export function DataTable<T>({ columns, data, sortable = true, pageSize = 25, keyFn }: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (sortCol === null || !sortable) return data
    const col = columns[sortCol]
    if (!col) return data
    const getValue = col.sortValue || col.accessor
    return [...data].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = String(av)
      const bs = String(bv)
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
  }, [data, sortCol, sortDir, sortable, columns])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  function handleSort(i: number) {
    if (!sortable) return
    if (sortCol === i) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(i)
      setSortDir('desc')
    }
    setPage(0)
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${sortable ? 'cursor-pointer select-none hover:text-text-primary transition-colors' : ''} ${col.className || ''}`}
                  onClick={() => handleSort(i)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortable && sortCol === i && (
                      <span className="text-text-primary text-[10px]">
                        {sortDir === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, ri) => (
              <tr
                key={keyFn ? keyFn(row, page * pageSize + ri) : page * pageSize + ri}
                className="border-b border-border/50 hover:bg-bg-surface transition-colors"
              >
                {columns.map((col, ci) => (
                  <td
                    key={ci}
                    className={`py-3 px-3 ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-xs text-text-muted font-body">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium border border-border text-text-secondary hover:text-text-primary hover:border-border-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted font-body tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium border border-border text-text-secondary hover:text-text-primary hover:border-border-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
