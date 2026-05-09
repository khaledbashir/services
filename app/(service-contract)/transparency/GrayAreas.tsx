interface Clause {
  title: string
  detail: string
  rule: string
}

interface MixedItem {
  id: string
  summary: string
  requester: string | null
  status: string
}

interface Props {
  clauses: Clause[]
  liveItems: MixedItem[]
}

export default function GrayAreas({ clauses, liveItems }: Props) {
  return (
    <section className="rounded-xl border border-amber-200/50 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/30 to-gray-50 dark:from-amber-950/20 dark:to-gray-950 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Gray Areas · the honest middle
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Items that aren&apos;t a clean fix or a clean change order. Here&apos;s how the call gets made.
          </p>
        </div>
        {liveItems.length > 0 ? (
          <span className="text-[10px] font-mono tabular-nums text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/60 px-2 py-1 rounded-full">
            {liveItems.length} live in this status
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {clauses.map((c, i) => (
          <div
            key={i}
            className="rounded-lg border border-amber-100 dark:border-amber-900/40 bg-white/70 dark:bg-gray-900/40 p-3"
          >
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">
              {c.title}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-snug">
              {c.detail}
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 leading-snug font-medium">
              <span className="text-gray-500 dark:text-gray-500 font-normal">how it&apos;s called: </span>
              {c.rule}
            </div>
          </div>
        ))}
      </div>

      {liveItems.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-amber-200/40 dark:border-amber-900/30">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
            Currently flagged as MIXED
          </div>
          <ul className="space-y-1.5">
            {liveItems.map((it) => (
              <li
                key={it.id}
                className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2"
              >
                <span className="inline-block w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-800 dark:text-gray-200">
                    {it.requester || 'someone'}:
                  </span>{' '}
                  <span className="line-clamp-1 inline">{it.summary}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-2 uppercase tracking-wide">
                    {it.status.replace('_', ' ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
