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
  const pctUsed = Math.min((c.service_contract_hours_used / c.service_contract_cap) * 100, 100)
  const overHours = Math.max(0, c.service_contract_hours_used - c.service_contract_cap)
  const overUsd = overHours * 90
  const meterTone =
    pctUsed >= 100 ? { ring: 'ring-rose-500/30', text: 'text-rose-900 dark:text-rose-100', accent: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500', border: 'border-rose-200 dark:border-rose-800/60', bg: 'from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-950/20', label: 'text-rose-700 dark:text-rose-300' }
    : pctUsed >= 75 ? { ring: 'ring-amber-500/30', text: 'text-amber-900 dark:text-amber-100', accent: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800/60', bg: 'from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-950/20', label: 'text-amber-700 dark:text-amber-300' }
    : { ring: 'ring-blue-500/20', text: 'text-blue-900 dark:text-blue-100', accent: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500 dark:bg-blue-400', border: 'border-blue-200 dark:border-blue-800/60', bg: 'from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-950/20', label: 'text-blue-700 dark:text-blue-300' }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Service Contract — hero meter, takes more visual weight */}
      <div className={`md:col-span-1 rounded-2xl border ${meterTone.border} bg-gradient-to-br ${meterTone.bg} p-5 shadow-sm ring-1 ${meterTone.ring}`}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${meterTone.label}`}>
            Service Contract · this month
          </span>
          {pctUsed >= 100 ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded-full animate-pulse">
              over cap
            </span>
          ) : null}
        </div>
        <div className={`text-5xl font-bold tabular-nums leading-none ${meterTone.text}`}>
          {fmtHrs(c.service_contract_hours_used)}
          <span className={`text-2xl font-medium ${meterTone.accent} ml-1`}>
            / {c.service_contract_cap}
          </span>
        </div>
        <div className={`text-sm font-medium ${meterTone.accent} mt-1`}>hrs used</div>
        <div className="h-2 rounded-full bg-white/60 dark:bg-black/30 mt-4 overflow-hidden">
          <div
            className={`h-full rounded-full ${meterTone.bar} transition-[width] duration-700`}
            style={{ width: `${pctUsed}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className={meterTone.accent}>
            {dHrs ? <span className={`font-mono tabular-nums ${dHrs.tone}`}>{dHrs.arrow} {dHrs.text}</span> : 'first activity this month'}
          </span>
          {overHours > 0 ? (
            <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
              +{overHours.toFixed(1)}h · {fmtUSD(overUsd)} overage
            </span>
          ) : null}
        </div>
      </div>

      {/* Warranty */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-950/20 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Warranty Active
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400/70">30d per delivery</span>
        </div>
        <div className="text-5xl font-bold tabular-nums leading-none text-emerald-900 dark:text-emerald-100">
          {c.warranty_active_count}
        </div>
        <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
          {c.warranty_active_count === 1 ? 'project under warranty' : 'projects under warranty'}
        </div>
        <div className="mt-4 text-xs text-emerald-700 dark:text-emerald-300">
          <WarrantyLiveCountdown expiresAt={c.warranty_newest_expires_at} />
        </div>
        {dWar ? (
          <div className={`text-xs font-mono tabular-nums mt-1 ${dWar.tone}`}>
            {dWar.arrow} {dWar.text}
          </div>
        ) : null}
      </div>

      {/* Change Orders — click through to the kanban */}
      <a
        href="/service-log/change-orders"
        className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-950/20 p-5 shadow-sm transition-shadow hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer block"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Change Orders
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400/70">separate quotes →</span>
        </div>
        <div className="text-5xl font-bold tabular-nums leading-none text-amber-900 dark:text-amber-100">
          {fmtUSD(totalCO)}
        </div>
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">
          across {c.change_order_open_count + c.change_order_shipped_count} {c.change_order_open_count + c.change_order_shipped_count === 1 ? 'item' : 'items'}
        </div>
        <div className="flex items-center justify-between mt-4 text-xs">
          <span className="text-amber-700 dark:text-amber-300">
            {c.change_order_open_count} open · {c.change_order_shipped_count} shipped
          </span>
          {dCo ? (
            <span className={`font-mono tabular-nums ${dCo.tone}`}>
              {dCo.arrow} {dCo.text}
            </span>
          ) : null}
        </div>
      </a>
    </div>
  )
}
