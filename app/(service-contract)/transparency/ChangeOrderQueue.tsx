interface QueueItem {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  status: string
  estimated_hours: number | null
  estimated_usd: number | null
}

interface Props {
  items: QueueItem[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number | null): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US')
}

const STATUS_LABEL: Record<string, string> = {
  open: 'awaiting quote',
  in_progress: 'in progress',
  quoted: 'quoted · awaiting approval',
}

export default function ChangeOrderQueue({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Change Order Queue
        </h2>
        <div className="text-zinc-400 dark:text-zinc-500 text-sm italic py-3">
          No open change orders. New asks for behavior or features that don&apos;t exist yet land here with their quote.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Change Order Queue · {items.length} open
        </h2>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">separate from retainer cap</span>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.map((r) => (
          <div key={r.id} className="py-3 flex items-start gap-3">
            <div className="flex-shrink-0 w-12 text-center">
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {fmtDate(r.received_at)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-block text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {STATUS_LABEL[r.status] || r.status}
                </span>
                {r.requester ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">from {r.requester}</span>
                ) : null}
              </div>
              <div className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">{r.summary}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-300">
                {fmtUSD(r.estimated_usd)}
              </div>
              {r.estimated_hours != null ? (
                <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {r.estimated_hours}h estimate
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
