interface Platform {
  platform: string
  fixes_shipped: number
  hours_used: number
  active_warranties: number
  open_cos: number
  open_co_usd: number
}

interface Props {
  platforms: Platform[]
}

const PLATFORM_LABEL: Record<string, { label: string; tagline: string }> = {
  'anc-services':    { label: 'Service Dashboard',    tagline: 'tickets, events, technician workflows' },
  'rag2':            { label: 'Proposal Engine',      tagline: 'estimates, RFPs, proposal generation' },
  'twenty-crm':      { label: 'CRM',                  tagline: 'companies, deals, dashboards, AI' },
  'anc-kb':          { label: 'Operator Docs',        tagline: 'docs.ancsports.net + AI assistant' },
  'crmdocs':         { label: 'Operator Docs',        tagline: 'docs.ancsports.net + AI assistant' },
  'openclaw':        { label: 'Slack Bot',            tagline: '@ANC bot + Slack workflows' },
  'other':           { label: 'Other',                tagline: 'cross-platform / unspecified' },
}

function fmtUSD(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

// Platform display order — locks to the four contract platforms.
// Anything else (other / openclaw / unmapped) is hidden unless it has activity.
const ORDER = ['anc-services', 'rag2', 'twenty-crm', 'anc-kb', 'crmdocs', 'openclaw', 'other']

export default function PlatformBreakdown({ platforms }: Props) {
  if (!platforms.length) return null

  // Hide rows with zero activity entirely — keeps the card focused on what's
  // actually moving this month. Sort by the contract order so platforms always
  // render in a stable left→right sequence.
  const visible = platforms
    .filter(p => p.fixes_shipped > 0 || p.hours_used > 0 || p.active_warranties > 0 || p.open_cos > 0)
    .sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform))

  if (!visible.length) {
    return (
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">By platform</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 italic">
          No platform activity yet this month.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">By platform</h2>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">where the work landed</span>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {visible.map((p) => {
          const meta = PLATFORM_LABEL[p.platform] || { label: p.platform, tagline: '' }
          return (
            <div key={p.platform} className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {meta.label}
                </div>
                {meta.tagline && (
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug truncate">
                    {meta.tagline}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-5 flex-shrink-0 text-xs">
                <div className="text-right">
                  <div className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-tight">
                    {p.hours_used.toFixed(1)}
                    <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 ml-1">hrs</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {p.fixes_shipped} shipped
                  </div>
                </div>
                {p.active_warranties > 0 && (
                  <div className="text-right">
                    <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400 leading-tight">
                      {p.active_warranties}
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400/80 mt-0.5">
                      warranty
                    </div>
                  </div>
                )}
                {p.open_cos > 0 && (
                  <div className="text-right">
                    <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400 leading-tight">
                      {p.open_cos}
                    </div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-0.5 tabular-nums">
                      CO · {fmtUSD(p.open_co_usd)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
