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

export default function PlatformBreakdown({ platforms }: Props) {
  if (!platforms.length) return null
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          By platform
        </h2>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          where the work landed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {platforms.map((p) => {
          const meta = PLATFORM_LABEL[p.platform] || { label: p.platform, tagline: '' }
          return (
            <div
              key={p.platform}
              className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40 p-3"
            >
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {meta.label}
              </div>
              {meta.tagline ? (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2 leading-tight">
                  {meta.tagline}
                </div>
              ) : null}
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {p.hours_used.toFixed(1)}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">hrs this month</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex-wrap">
                <span>
                  <strong className="text-zinc-700 dark:text-zinc-300">{p.fixes_shipped}</strong> shipped
                </span>
                {p.active_warranties > 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {p.active_warranties} under warranty
                  </span>
                ) : null}
                {p.open_cos > 0 ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    {p.open_cos} CO · {fmtUSD(p.open_co_usd)}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
