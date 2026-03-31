interface InsightCardProps {
  title: string
  value: string
  description: string
  accent?: string
}

export function InsightCard({ title, value, description, accent = '#000' }: InsightCardProps) {
  return (
    <div
      className="relative rounded-xl bg-bg-base border border-border p-6 md:p-8 overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div className="text-xs uppercase tracking-widest text-text-muted font-body font-medium mb-3">
        {title}
      </div>
      <div className="font-display text-text-primary text-3xl md:text-4xl leading-none mb-3">
        {value}
      </div>
      <div className="text-text-secondary font-body text-sm leading-relaxed max-w-lg">
        {description}
      </div>
    </div>
  )
}
