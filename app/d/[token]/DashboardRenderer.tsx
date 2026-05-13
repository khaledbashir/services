// Beautiful public dashboard renderer — accepts a JSON spec from the
// anc-dashboard-builder agent skill and lays it out as a modern Tailwind
// page with KPIs, bar/donut charts, sortable tables, and tone-colored
// callouts. No external chart library — CSS-only viz.

interface KpiBlock {
  type: 'kpi'
  label: string
  value: string | number
  delta?: string
  tone?: 'gray' | 'emerald' | 'rose' | 'amber' | 'blue' | 'violet'
  sub?: string
}

interface BarChartBlock {
  type: 'bar_chart'
  title: string
  subtitle?: string
  rows: Array<{ label: string; value: number; sub?: string; tone?: string }>
  format?: 'number' | 'usd' | 'percent'
}

interface DonutBlock {
  type: 'donut'
  title: string
  subtitle?: string
  segments: Array<{ label: string; value: number; tone?: string }>
  format?: 'number' | 'usd' | 'percent'
}

interface TableBlock {
  type: 'table'
  title?: string
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center' }>
  rows: Array<Record<string, string | number | null>>
}

interface CalloutBlock {
  type: 'callout'
  tone: 'success' | 'warning' | 'risk' | 'info' | 'neutral'
  title: string
  body?: string
  items?: string[]
}

interface SectionBlock {
  type: 'section'
  title: string
  subtitle?: string
}

interface KpiGridBlock {
  type: 'kpi_grid'
  cards: Omit<KpiBlock, 'type'>[]
}

interface QuoteBlock {
  type: 'quote'
  body: string
  attribution?: string
}

export type Block =
  | KpiBlock | KpiGridBlock | BarChartBlock | DonutBlock | TableBlock
  | CalloutBlock | SectionBlock | QuoteBlock

export interface DashboardSpec {
  title: string
  subtitle?: string
  blocks: Block[]
  theme?: 'light' | 'dark' | 'auto'
}

const KPI_TONE: Record<string, string> = {
  gray:    'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
  emerald: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-900 border-emerald-200 dark:border-emerald-900/40',
  rose:    'bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/40 dark:to-gray-900 border-rose-200 dark:border-rose-900/40',
  amber:   'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-gray-900 border-amber-200 dark:border-amber-900/40',
  blue:    'bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-gray-900 border-blue-200 dark:border-blue-900/40',
  violet:  'bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-gray-900 border-violet-200 dark:border-violet-900/40',
}

const CALLOUT_TONE: Record<string, string> = {
  success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100',
  warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-100',
  risk:    'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-100',
  info:    'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-100',
  neutral: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100',
}

const SEG_PALETTE = [
  'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-indigo-500', 'bg-orange-500', 'bg-teal-500',
]

function formatValue(v: number, format?: string): string {
  if (format === 'usd') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (format === 'percent') return v.toFixed(1) + '%'
  return v.toLocaleString('en-US')
}

function Kpi({ block }: { block: Omit<KpiBlock, 'type'> }) {
  const tone = KPI_TONE[block.tone || 'gray'] || KPI_TONE.gray
  const deltaTone = block.delta?.startsWith('-') ? 'text-rose-600 dark:text-rose-400' : block.delta?.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{block.label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1 leading-tight text-gray-900 dark:text-gray-100">{String(block.value)}</div>
      <div className="flex items-baseline gap-2 mt-1">
        {block.delta && <span className={`text-xs font-semibold tabular-nums ${deltaTone}`}>{block.delta}</span>}
        {block.sub && <span className="text-[11px] text-gray-500 dark:text-gray-400">{block.sub}</span>}
      </div>
    </div>
  )
}

function BarChart({ block }: { block: BarChartBlock }) {
  const max = Math.max(...block.rows.map((r) => r.value || 0), 1)
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="mb-1">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{block.title}</h3>
        {block.subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400">{block.subtitle}</p>}
      </div>
      <div className="space-y-2 mt-3">
        {block.rows.map((r, i) => {
          const pct = max > 0 ? (r.value / max) * 100 : 0
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{r.label}</span>
                <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {formatValue(r.value, block.format)}
                  {r.sub && <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">· {r.sub}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Donut({ block }: { block: DonutBlock }) {
  const total = block.segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1
  let cumulative = 0
  const arcs = block.segments.map((seg, i) => {
    const start = (cumulative / total) * 360
    cumulative += seg.value || 0
    const end = (cumulative / total) * 360
    return { ...seg, start, end, palette: SEG_PALETTE[i % SEG_PALETTE.length] }
  })
  const conicSegments = arcs.map((a, i) => `var(--seg-${i}) ${a.start}deg ${a.end}deg`).join(', ')
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{block.title}</h3>
        {block.subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400">{block.subtitle}</p>}
      </div>
      <div className="flex items-center gap-5">
        <div
          className="w-32 h-32 rounded-full relative shrink-0"
          style={{
            background: `conic-gradient(${conicSegments})`,
            ...Object.fromEntries(arcs.map((a, i) => [`--seg-${i}`, paletteToHex(a.palette)])),
          } as React.CSSProperties}
        >
          <div className="absolute inset-3 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Total</div>
              <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatValue(total, block.format)}</div>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {arcs.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-sm ${a.palette}`} />
                <span className="truncate text-gray-700 dark:text-gray-300">{a.label}</span>
              </div>
              <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">{formatValue(a.value, block.format)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function paletteToHex(klass: string): string {
  const map: Record<string, string> = {
    'bg-violet-500': '#8b5cf6', 'bg-sky-500': '#0ea5e9', 'bg-emerald-500': '#10b981',
    'bg-amber-500': '#f59e0b', 'bg-rose-500': '#f43f5e', 'bg-indigo-500': '#6366f1',
    'bg-orange-500': '#f97316', 'bg-teal-500': '#14b8a6',
  }
  return map[klass] || '#6b7280'
}

function Table({ block }: { block: TableBlock }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {block.title && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{block.title}</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {block.rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/30">
                {block.columns.map((c, j) => {
                  const val = row[c.key]
                  return (
                    <td key={j} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left'} text-gray-700 dark:text-gray-300`}>
                      {val === null || val === undefined ? <span className="text-gray-400">—</span> : String(val)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Callout({ block }: { block: CalloutBlock }) {
  const tone = CALLOUT_TONE[block.tone] || CALLOUT_TONE.neutral
  const icon = block.tone === 'success' ? '✓' : block.tone === 'warning' ? '⚠' : block.tone === 'risk' ? '!' : 'ℹ'
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5 opacity-80">{icon}</div>
        <div className="flex-1">
          <h3 className="font-bold text-base">{block.title}</h3>
          {block.body && <p className="text-sm mt-1 opacity-90 leading-relaxed">{block.body}</p>}
          {block.items && block.items.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm list-disc pl-5">
              {block.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ block }: { block: SectionBlock }) {
  return (
    <div className="mt-2 mb-1">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{block.title}</h2>
      {block.subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{block.subtitle}</p>}
    </div>
  )
}

function KpiGrid({ block }: { block: KpiGridBlock }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {block.cards.map((card, i) => <Kpi key={i} block={card} />)}
    </div>
  )
}

function Quote({ block }: { block: QuoteBlock }) {
  return (
    <blockquote className="border-l-4 border-gray-300 dark:border-gray-700 pl-4 py-1 italic text-gray-700 dark:text-gray-300">
      <p className="text-base leading-relaxed">{block.body}</p>
      {block.attribution && <footer className="text-xs text-gray-500 dark:text-gray-400 not-italic mt-1">— {block.attribution}</footer>}
    </blockquote>
  )
}

export default function DashboardRenderer({ spec, meta }: {
  spec: DashboardSpec
  meta: { createdBy: string | null; createdAt: string | Date; expiresAt: string | Date | null }
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-gray-500 dark:text-gray-400 mb-2">ANC Sports · Advisor</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{spec.title}</h1>
          {spec.subtitle && <p className="text-base text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">{spec.subtitle}</p>}
        </header>

        <main className="space-y-4">
          {spec.blocks.map((block, i) => {
            switch (block.type) {
              case 'kpi':       return <Kpi key={i} block={block} />
              case 'kpi_grid':  return <KpiGrid key={i} block={block} />
              case 'bar_chart': return <BarChart key={i} block={block} />
              case 'donut':     return <Donut key={i} block={block} />
              case 'table':     return <Table key={i} block={block} />
              case 'callout':   return <Callout key={i} block={block} />
              case 'section':   return <Section key={i} block={block} />
              case 'quote':     return <Quote key={i} block={block} />
              default:          return null
            }
          })}
        </main>

        <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 dark:text-gray-500 flex flex-wrap items-center justify-between gap-2">
          <div>Generated by {meta.createdBy || 'ANC Advisor'} · {new Date(meta.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
          {meta.expiresAt && <div>Link expires {new Date(meta.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>}
        </footer>
      </div>
    </div>
  )
}
