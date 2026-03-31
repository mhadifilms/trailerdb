interface BarChartItem {
  label: string
  value: number
  color?: string
}

interface BarChartProps {
  items: BarChartItem[]
  maxValue?: number
  formatValue?: (v: number) => string
  height?: number
}

function defaultFormat(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}

export function BarChart({
  items,
  maxValue,
  formatValue = defaultFormat,
  height = 28,
}: BarChartProps) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const w = max > 0 ? Math.max((item.value / max) * 100, 0.5) : 0
        return (
          <div key={idx} className="flex items-center gap-3">
            <span className="w-28 md:w-40 shrink-0 text-right text-xs font-body text-text-secondary truncate">
              {item.label}
            </span>
            <div className="flex-1 bg-bg-surface rounded-md overflow-hidden" style={{ height }}>
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{
                  width: `${w}%`,
                  backgroundColor: item.color || '#000',
                  opacity: 0.8,
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-body text-text-muted tabular-nums">
              {formatValue(item.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
