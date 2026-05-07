interface CoverageProps {
  coverage: {
    service_contract_hours_used: number
    service_contract_cap: number
    warranty_active_count: number
    warranty_hours_protected: number
    change_order_open_count: number
    change_order_open_usd: number
    change_order_shipped_count: number
    change_order_shipped_usd: number
  }
}

function fmtHrs(n: number): string {
  return n.toFixed(n < 10 ? 1 : 0)
}

function fmtUSD(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function CoverageStrip({ coverage }: CoverageProps) {
  const c = coverage
  const totalCO = c.change_order_open_usd + c.change_order_shipped_usd

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {/* Service Contract */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Service Contract
          </span>
          <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70">this month</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
          {fmtHrs(c.service_contract_hours_used)}
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 ml-1">
            / {c.service_contract_cap} hrs
          </span>
        </div>
        <div className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1">
          retainer-covered fixes deducted
        </div>
      </div>

      {/* Warranty */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Warranty Active
          </span>
          <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">30-day clock</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
          {c.warranty_active_count}
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 ml-1">
            {c.warranty_active_count === 1 ? 'fix' : 'fixes'}
          </span>
        </div>
        <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
          {fmtHrs(c.warranty_hours_protected)} hrs of work re-fix-free
        </div>
      </div>

      {/* Change Orders */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Change Orders
          </span>
          <span className="text-[10px] text-amber-600/70 dark:text-amber-400/70">separate quotes</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
          {fmtUSD(totalCO)}
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400 ml-1">
            / {c.change_order_open_count + c.change_order_shipped_count}
            {c.change_order_open_count + c.change_order_shipped_count === 1 ? ' item' : ' items'}
          </span>
        </div>
        <div className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
          {c.change_order_open_count} open · {c.change_order_shipped_count} shipped this month
        </div>
      </div>
    </div>
  )
}
