interface ActivityEvent {
  id: string
  ts: string
  kind: 'triaged' | 'started' | 'quoted' | 'shipped' | 'cancelled'
  classification: 'FIX' | 'NEW' | 'MIXED'
  requester: string | null
  summary: string
  hours: number | null
  usd: number | null
}

interface Props {
  events: ActivityEvent[]
}

const KIND_DOT: Record<string, string> = {
  triaged: 'bg-zinc-400',
  started: 'bg-blue-500',
  quoted:  'bg-purple-500',
  shipped: 'bg-emerald-500',
  cancelled: 'bg-rose-400',
}

const KIND_VERB: Record<string, string> = {
  triaged: 'triaged',
  started: 'started',
  quoted:  'quoted',
  shipped: 'shipped',
  cancelled: 'cancelled',
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function initials(n: string | null): string {
  if (!n) return '?'
  return n.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')
}

export default function ActivityTicker({ events }: Props) {
  if (!events.length) {
    return (
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Live activity
        </h2>
        <div className="text-zinc-400 dark:text-zinc-500 text-sm italic">No activity in the last 14 days.</div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Live activity
        </h2>
        <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          auto-refresh 1m
        </span>
      </div>
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id + e.kind} className="flex items-start gap-3 text-sm">
            <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2 ${KIND_DOT[e.kind] || 'bg-zinc-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                <span
                  title={e.requester || ''}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[8px] font-bold text-zinc-700 dark:text-zinc-300"
                >
                  {initials(e.requester)}
                </span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                  <strong className="font-semibold">{e.requester || 'someone'}</strong>{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    — {KIND_VERB[e.kind] || e.kind} a
                  </span>{' '}
                  <span
                    className={
                      e.classification === 'FIX'
                        ? 'text-blue-700 dark:text-blue-400 font-medium'
                        : 'text-amber-700 dark:text-amber-400 font-medium'
                    }
                  >
                    {e.classification === 'FIX' ? 'service-contract fix' : 'change-order item'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug mt-0.5 line-clamp-1">
                {e.summary}
              </div>
            </div>
            <span className="flex-shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
              {relTime(e.ts)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
