import { getDashboardData, COVERED_CLAUSES, NOT_COVERED_CLAUSES } from '@/lib/transparency-data'
import WarrantyCountdown from './WarrantyCountdown'
import RequestTimeline from './RequestTimeline'

const PAYMENT_TONE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  paid:     { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500',         label: 'Paid' },
  invoiced: { bg: 'bg-blue-50 dark:bg-blue-950',       text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500',            label: 'Invoiced' },
  pending:  { bg: 'bg-amber-50 dark:bg-amber-950',     text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500',           label: 'Pending' },
  overdue:  { bg: 'bg-rose-50 dark:bg-rose-950',       text: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500 animate-pulse', label: 'Overdue' },
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function TransparencyDashboard() {
  const data = await getDashboardData()
  const meter = data.meter

  const meterFillColor =
    meter.pct_used >= 100 ? '#ef4444'
    : meter.pct_used >= 75 ? '#f59e0b'
    : '#10b981'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-5xl mx-auto px-5 pt-7 pb-12">

        <header className="flex items-center justify-between gap-4 mb-7 flex-wrap">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" className="h-8 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_white.png" alt="ANC Sports" className="h-8 w-auto hidden dark:block" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">Service Transparency</span>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Updated {fmtTime(data.generated_at)} · auto-refreshes every minute
          </div>
        </header>

        <h1 className="text-2xl font-bold tracking-tight mb-1">Platform Support &amp; Maintenance</h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">
          Live status of ANC&apos;s monthly service contract — credit used, warranty in force, and what&apos;s covered.
        </p>

        {/* Row 1: credit meter + warranty list */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Service Credit · {meter.month}
              </h2>
              {(() => {
                const tone = PAYMENT_TONE[data.payment.status] || PAYMENT_TONE.pending
                return (
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {tone.label}
                  </div>
                )
              })()}
            </div>
            <div className="text-4xl font-bold tracking-tight tabular-nums leading-tight">
              {meter.hours_used.toFixed(1)}
              <span className="text-base font-medium text-zinc-500 dark:text-zinc-400 ml-1">/ {meter.cap_hours} hrs used</span>
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {meter.hours_remaining.toFixed(1)} hrs remaining this month ·{' '}
              {meter.overage_hours > 0 ? `${meter.overage_hours.toFixed(1)} hrs overage at $90/hr` : 'No overage'}
            </div>
            <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 mt-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${meter.pct_used}%`, background: meterFillColor }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-500 mt-2">
              <span>0 hrs</span>
              <span>{meter.cap_hours} hrs cap</span>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
              Warranty · 30-day clock per shipped fix
            </h2>
            {data.warranty_items.length === 0 ? (
              <div className="text-zinc-400 dark:text-zinc-500 text-sm italic py-3">
                No fixes shipped in the last 30 days. The warranty clock starts on each new ship.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.warranty_items.map((w) => (
                  <div key={w.id} className="flex items-start justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm leading-snug truncate">{w.summary}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Shipped {fmtDate(w.shipped_at)} · expires {fmtDate(w.warranty_expires)}
                        {w.repo ? ` · ${w.repo}` : ''}
                      </div>
                    </div>
                    <WarrantyCountdown shippedAt={w.shipped_at} expiresAt={w.warranty_expires} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Row 2: covered/not-covered + recently shipped */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
              What&apos;s covered each month
            </h2>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {COVERED_CLAUSES.map((c) => (
                <div key={c.title} className="flex gap-3 py-2.5">
                  <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center text-[11px] font-bold mt-0.5">
                    ✓
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{c.title}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <details className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 group">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 list-none flex items-center justify-between [&amp;::-webkit-details-marker]:hidden">
                <span>What&apos;s a separate quote</span>
                <span className="text-base text-zinc-400 dark:text-zinc-500 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {NOT_COVERED_CLAUSES.map((c) => (
                  <div key={c.title} className="flex gap-3 py-2.5">
                    <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center text-[11px] font-bold mt-0.5">
                      −
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
              Shipped this month
            </h2>
            {data.recently_shipped.length === 0 ? (
              <div className="text-zinc-400 dark:text-zinc-500 text-sm italic py-3">
                Nothing shipped yet this month — credit at full.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.recently_shipped.map((s) => (
                  <div key={s.id} className="flex justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0 truncate">{s.summary}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {fmtDate(s.shipped_at)}{s.actual_hours != null ? ` · ${s.actual_hours.toFixed(1)} hrs` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Row 3: request timeline */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Request timeline
            </h2>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">click any row for the why</span>
          </div>
          <RequestTimeline requests={data.triaged_requests} />
        </section>

        <footer className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-10">
          ANC Sports · Standard service contract · $1,500/mo · 12 hrs included · 30-day warranty on shipped work · $90/hr overage<br />
          Quotes for new work derived from US market median → outsourcing efficiency → contract rate → long-term-partner adjustment. Click any request row above to see the chain.
        </footer>
      </div>
    </div>
  )
}
