import type { RequestIntelligence as RequestIntelligenceData } from '@/lib/transparency-data'

function fmtUsd(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

export default function RequestIntelligence({ data }: { data: RequestIntelligenceData }) {
  const slackPct = pct(data.slack_inputs, data.inputs_analyzed)
  const coTotal = data.change_order_count + data.mixed_count
  const servicePct = pct(data.service_contract_count, data.inputs_analyzed)
  const coPct = pct(coTotal, data.inputs_analyzed)

  return (
    <section id="request-intelligence" className="scroll-mt-32 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-4 overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            AI request intelligence
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 mt-1">
            Stakeholder signals, summarized into next moves
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            The report reads the request ledger, classifies support vs new scope, and surfaces aggregated themes. No message text, names, or private excerpts are shown here.
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 dark:text-blue-300">
            Inputs read
          </div>
          <div className="text-3xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
            {data.inputs_analyzed}
          </div>
          <div className="text-[11px] text-blue-700/70 dark:text-blue-300/70">
            {data.window_label}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 mb-5">
        <Metric label="Request inputs" value={data.slack_inputs.toLocaleString('en-US')} sub={`${slackPct}% from message intake`} tone="blue" />
        <Metric label="Stakeholders" value={data.unique_requesters.toLocaleString('en-US')} sub="unique requesters" tone="gray" />
        <Metric label="Open opportunities" value={data.open_opportunity_count.toLocaleString('en-US')} sub="new-scope queue" tone="amber" />
        <Metric label="Visible upside" value={fmtUsd(data.open_opportunity_usd)} sub="open opportunity value" tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Scope mix</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">How the AI classification is splitting support vs new work.</p>
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">live ledger</div>
          </div>
          <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden flex">
            <div className="bg-blue-500" style={{ width: `${servicePct}%` }} />
            <div className="bg-amber-500" style={{ width: `${coPct}%` }} />
            <div className="bg-gray-400 dark:bg-gray-600" style={{ width: `${Math.max(0, 100 - servicePct - coPct)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
            <Legend color="bg-blue-500" label="Service contract" value={data.service_contract_count} />
            <Legend color="bg-amber-500" label="Change order" value={data.change_order_count} />
            <Legend color="bg-gray-400 dark:bg-gray-600" label="Mixed" value={data.mixed_count} />
          </div>

          {data.top_platforms.length > 0 ? (
            <div className="mt-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Signal clusters
              </div>
              <div className="space-y-2">
                {data.top_platforms.map((platform) => {
                  const width = pct(platform.inputs, Math.max(...data.top_platforms.map((p) => p.inputs), 1))
                  return (
                    <div key={platform.platform}>
                      <div className="flex items-center justify-between gap-3 text-xs mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{platform.platform}</span>
                        <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                          {platform.inputs} signal{platform.inputs === 1 ? '' : 's'}
                          {platform.opportunity_usd > 0 ? ` · ${fmtUsd(platform.opportunity_usd)}` : ''}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                        <div className="h-full rounded-full bg-gray-900 dark:bg-white" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Suggested next moves</h3>
              <p className="text-[11px] text-amber-800/70 dark:text-amber-200/70">Shared-safe opportunities from aggregated request patterns.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.next_moves.map((move, idx) => (
              <div key={move.title} className="rounded-lg bg-white/70 dark:bg-gray-950/40 border border-amber-200/70 dark:border-amber-900/50 p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white tabular-nums">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{move.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-snug">{move.detail}</div>
                    <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mt-1">{move.impact}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'blue' | 'gray' | 'amber' | 'emerald' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100',
    gray: 'border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 min-w-0">
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="truncate">{label}</span>
      <span className="font-mono tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )
}
