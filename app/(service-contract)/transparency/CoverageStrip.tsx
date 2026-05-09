import WarrantyLiveCountdown from './WarrantyLiveCountdown'

interface CoverageProps {
  coverage: {
    service_contract_hours_used: number
    service_contract_cap: number
    warranty_active_count: number
    warranty_hours_protected: number
    warranty_days_remaining_total: number
    warranty_newest_expires_at: string | null
    change_order_open_count: number
    change_order_open_usd: number
    change_order_shipped_count: number
    change_order_shipped_usd: number
    prev_service_contract_hours: number
    prev_warranty_active_count: number
    prev_change_order_total_usd: number
  }
}

function fmtHrs(n: number): string {
  return n.toFixed(n < 10 ? 1 : 0)
}

function fmtUSD(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function delta(current: number, prev: number, suffix = ''): { arrow: string; tone: string; text: string } | null {
  if (prev === 0 && current === 0) return null
  if (prev === 0) {
    return { arrow: '▲', tone: 'text-emerald-600 dark:text-emerald-400', text: `new${suffix}` }
  }
  const diff = current - prev
  if (diff === 0) return { arrow: '·', tone: 'text-gray-400 dark:text-gray-500', text: `same as last month` }
  const pct = Math.round((Math.abs(diff) / prev) * 100)
  const arrow = diff > 0 ? '▲' : '▼'
  const tone = diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  return { arrow, tone, text: `${pct}%${suffix}` }
}

function deltaHours(current: number, prev: number) {
  if (prev === 0 && current === 0) return null
  const diff = current - prev
  if (diff === 0) return { arrow: '·', tone: 'text-gray-400 dark:text-gray-500', text: 'same' }
  const arrow = diff > 0 ? '▲' : '▼'
  const tone = diff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
  return { arrow, tone, text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}h vs last month` }
}

function deltaUsd(current: number, prev: number) {
  if (prev === 0 && current === 0) return null
  const diff = current - prev
  if (diff === 0) return { arrow: '·', tone: 'text-gray-400 dark:text-gray-500', text: 'same' }
  const arrow = diff > 0 ? '▲' : '▼'
  const tone = diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  return { arrow, tone, text: `${diff > 0 ? '+' : ''}${fmtUSD(Math.abs(diff))} vs last month` }
}

export default function CoverageStrip({ coverage }: CoverageProps) {
  const c = coverage
  const totalCO = c.change_order_open_usd + c.change_order_shipped_usd
  const dHrs = deltaHours(c.service_contract_hours_used, c.prev_service_contract_hours)
  const dWar = delta(c.warranty_active_count, c.prev_warranty_active_count, ' vs last month')
  const dCo = deltaUsd(totalCO, c.prev_change_order_total_usd)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Service Contract */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800/60 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-950/20 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Service Contract
          </span>
          <span className="text-[10px] text-blue-500 dark:text-blue-400/60">this month</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
          {fmtHrs(c.service_contract_hours_used)}
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 ml-1">
            / {c.service_contract_cap} hrs
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1">
          <span>retainer-covered fixes</span>
          {dHrs ? (
            <>
              <span className="text-blue-300 dark:text-blue-700">·</span>
              <span className={`font-mono tabular-nums ${dHrs.tone}`}>
                {dHrs.arrow} {dHrs.text}
              </span>
            </>
          ) : null}
        </div>
        {/* Mini progress bar */}
        <div className="h-1.5 rounded-full bg-blue-200 dark:bg-blue-900 mt-2.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-[width] duration-700"
            style={{ width: `${Math.min((c.service_contract_hours_used / c.service_contract_cap) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Warranty */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-950/20 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Warranty Active
          </span>
          <span className="text-[10px] text-emerald-500 dark:text-emerald-400/60">30 days per project</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
          {c.warranty_active_count}
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 ml-1">
            {c.warranty_active_count === 1 ? 'project' : 'projects'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 mt-1">
          <WarrantyLiveCountdown expiresAt={c.warranty_newest_expires_at} />
          {dWar ? (
            <>
              <span className="text-emerald-300 dark:text-emerald-700">·</span>
              <span className={`font-mono tabular-nums ${dWar.tone}`}>
                {dWar.arrow} {dWar.text}
              </span>
            </>
          ) : null}
        </div>
        <div className="text-[10px] text-emerald-500 dark:text-emerald-400/70 mt-0.5">
          Each delivered project carries a 30-day post-delivery responsibility window. The clock counts down the newest delivery&apos;s warranty.
        </div>
      </div>

      {/* Change Orders — click through to the kanban */}
      <a
        href="/service-log/change-orders"
        className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-950/20 p-4 shadow-sm transition-shadow hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer block"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Change Orders
          </span>
          <span className="text-[10px] text-amber-500 dark:text-amber-400/60">separate quotes →</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
          {fmtUSD(totalCO)}
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400 ml-1">
            / {c.change_order_open_count + c.change_order_shipped_count}
            {c.change_order_open_count + c.change_order_shipped_count === 1 ? ' item' : ' items'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-1">
          <span>
            {c.change_order_open_count} open · {c.change_order_shipped_count} shipped
          </span>
          {dCo ? (
            <>
              <span className="text-amber-300 dark:text-amber-700">·</span>
              <span className={`font-mono tabular-nums ${dCo.tone}`}>
                {dCo.arrow} {dCo.text}
              </span>
            </>
          ) : null}
        </div>
      </a>
    </div>
  )
}
