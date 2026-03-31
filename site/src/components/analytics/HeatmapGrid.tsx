import { useState } from 'react'

interface HeatmapGridProps {
  rows: string[]
  cols: string[]
  data: (number | null)[][]
  colorScale: (value: number, max: number) => string
  formatValue?: (value: number) => string
  label?: string
}

export function HeatmapGrid({ rows, cols, data, colorScale, formatValue, label }: HeatmapGridProps) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)

  // Find the max value for scaling
  let maxVal = 0
  for (const row of data) {
    for (const v of row) {
      if (v != null && v > maxVal) maxVal = v
    }
  }

  const fmt = formatValue || ((v: number) => v.toLocaleString())

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      {label && (
        <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mb-4">
          {label}
        </div>
      )}
      <div className="inline-block min-w-full">
        {/* Column headers */}
        <div className="flex">
          <div className="w-28 md:w-36 shrink-0" />
          {cols.map((col, ci) => (
            <div
              key={ci}
              className="flex-1 min-w-[60px] text-center text-[10px] uppercase tracking-wider text-text-muted font-body font-medium pb-2 px-0.5"
            >
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((rowLabel, ri) => (
          <div key={ri} className="flex items-center">
            <div className="w-28 md:w-36 shrink-0 text-right pr-3 text-xs text-text-secondary font-body truncate py-0.5">
              {rowLabel}
            </div>
            {cols.map((_, ci) => {
              const val = data[ri]?.[ci] ?? null
              const isHovered = hover?.row === ri && hover?.col === ci
              return (
                <div
                  key={ci}
                  className="flex-1 min-w-[60px] aspect-[2/1] relative px-0.5 py-0.5"
                  onMouseEnter={() => setHover({ row: ri, col: ci })}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="w-full h-full rounded-sm flex items-center justify-center transition-all duration-200"
                    style={{
                      backgroundColor: val != null ? colorScale(val, maxVal) : '#f8f8f8',
                      outline: isHovered ? '2px solid #000' : 'none',
                      outlineOffset: -1,
                    }}
                  >
                    {isHovered && val != null && (
                      <span className="text-[10px] font-body font-semibold text-text-primary tabular-nums">
                        {fmt(val)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 ml-28 md:ml-36">
          <span className="text-[10px] text-text-muted font-body">Low</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((pct) => (
              <div
                key={pct}
                className="w-6 h-3 rounded-sm"
                style={{ backgroundColor: colorScale(pct * maxVal, maxVal) }}
              />
            ))}
          </div>
          <span className="text-[10px] text-text-muted font-body">High</span>
        </div>
      </div>
    </div>
  )
}
