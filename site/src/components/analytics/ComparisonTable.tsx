interface MetricDef {
  key: string
  label: string
  format: (v: number | string) => string
  higherIsBetter?: boolean
}

interface ComparisonItem {
  name: string
  metrics: Record<string, number | string>
}

interface ComparisonTableProps {
  items: ComparisonItem[]
  metricDefs: MetricDef[]
}

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function ComparisonTable({ items, metricDefs }: ComparisonTableProps) {
  if (items.length === 0) return null

  function findWinner(def: MetricDef): number {
    const higherIsBetter = def.higherIsBetter !== false
    let bestIdx = 0
    let bestVal = -Infinity
    for (let i = 0; i < items.length; i++) {
      const raw = items[i]!.metrics[def.key]
      const numVal = typeof raw === 'number' ? raw : Number(raw) || 0
      const val = higherIsBetter ? numVal : -numVal
      if (val > bestVal) {
        bestVal = val
        bestIdx = i
      }
    }
    return bestIdx
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium">
              Metric
            </th>
            {items.map((item, i) => (
              <th
                key={i}
                className="text-right py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium"
              >
                {item.name}
              </th>
            ))}
            {items.length > 1 && (
              <th className="text-center py-3 px-3 text-text-muted text-xs uppercase tracking-wider font-medium w-20">
                Best
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {metricDefs.map((def) => {
            const winnerIdx = items.length > 1 ? findWinner(def) : -1
            return (
              <tr key={def.key} className="border-b border-border/50 hover:bg-bg-surface transition-colors">
                <td className="py-3 px-3 text-text-secondary font-medium">
                  {def.label}
                </td>
                {items.map((item, i) => {
                  const raw = item.metrics[def.key]
                  const formatted = def.format(raw ?? 0)
                  const isWinner = i === winnerIdx && items.length > 1
                  return (
                    <td
                      key={i}
                      className={`py-3 px-3 text-right tabular-nums ${
                        isWinner
                          ? 'text-text-primary font-semibold'
                          : 'text-text-secondary'
                      }`}
                    >
                      {formatted}
                    </td>
                  )
                })}
                {items.length > 1 && (
                  <td className="py-3 px-3 text-center">
                    <span className="inline-block w-6 h-6 rounded-full bg-bg-surface border border-border text-[10px] leading-6 font-body font-semibold text-text-primary">
                      {winnerIdx + 1}
                    </span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Visual bar comparison */}
      {items.length > 1 && (
        <div className="mt-8 space-y-6">
          {metricDefs.slice(0, 4).map((def) => {
            const values = items.map((item) => {
              const raw = item.metrics[def.key]
              return typeof raw === 'number' ? raw : Number(raw) || 0
            })
            const maxVal = Math.max(...values, 1)
            return (
              <div key={def.key}>
                <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mb-2">
                  {def.label}
                </div>
                <div className="space-y-1">
                  {items.map((item, i) => {
                    const val = values[i] ?? 0
                    const w = Math.max((val / maxVal) * 100, 0.5)
                    const colors = ['#000', '#a4a4a4', '#e5e5e5']
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-right text-xs font-body text-text-secondary truncate">
                          {item.name}
                        </span>
                        <div className="flex-1 h-6 bg-bg-surface rounded-md overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-300"
                            style={{ width: `${w}%`, backgroundColor: colors[i % colors.length] }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs font-body text-text-muted tabular-nums">
                          {def.format(val)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { type ComparisonItem, type MetricDef }
export { formatNum }
