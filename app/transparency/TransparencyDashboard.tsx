import { getDashboardData, COVERED_CLAUSES, NOT_COVERED_CLAUSES, GRAY_AREA_CLAUSES } from '@/lib/transparency-data'
import { getPublicPayoneerLinks } from '@/lib/retainer-alerts'
import { query } from '@/lib/db'
import WarrantyCountdown from './WarrantyCountdown'
import CoverageStrip from './CoverageStrip'
import TransparencyTabs from './TransparencyTabs'
import StoryHero from './StoryHero'
import Burndown from './Burndown'
import ActivityTicker from './ActivityTicker'
import PlatformBreakdown from './PlatformBreakdown'
import PrintButton from './PrintButton'
import GrayAreas from './GrayAreas'
import MetricsExplainer from './MetricsExplainer'
import PaymentCTAs from './PaymentCTAs'
import './print.css'

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

function PaymentBadge({ payment }: { payment: { status: string; amount: number | null; invoice_number: string | null } }) {
  const tone = PAYMENT_TONE[payment.status] || PAYMENT_TONE.pending
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${tone.bg} ${tone.text} shadow-sm`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
      {payment.amount != null ? ` · $${payment.amount.toLocaleString('en-US')}` : ''}
      {payment.invoice_number ? ` · ${payment.invoice_number}` : ''}
    </div>
  )
}

export default async function TransparencyDashboard() {
  const data = await getDashboardData()
  const meter = data.meter
  const payoneer = getPublicPayoneerLinks()
  const pendingCheck = await query(
    `SELECT 1 FROM service_requests
      WHERE retainer_covered = false
        AND status = 'shipped'
      LIMIT 1`,
  ).catch(() => ({ rows: [] }))
  const hasPendingChangeOrder = pendingCheck.rows.length > 0

  const meterColor =
    meter.pct_used >= 100 ? 'rose'
    : meter.pct_used >= 75 ? 'amber'
    : 'emerald'

  const meterGradient =
    meter.pct_used >= 100 ? 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)'
    : meter.pct_used >= 75 ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
    : 'linear-gradient(90deg, #10b981 0%, #059669 100%)'

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-5xl mx-auto px-5 pt-8 pb-16">

        <header className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" className="h-10 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_white.png" alt="ANC Sports" className="h-10 w-auto hidden dark:block" />
            <div className="border-l border-zinc-300 dark:border-zinc-700 pl-3">
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] font-semibold leading-none">
                Service
              </div>
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight">
                Transparency
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3" data-no-print="true">
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live · {fmtTime(data.generated_at)}
            </span>
            <PrintButton />
          </div>
        </header>

        <h1 className="text-3xl font-bold tracking-tight mb-1">Platform Support &amp; Maintenance</h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-8">
          Live status of ANC&apos;s monthly service contract — credit used, warranty in force, and what&apos;s covered.
        </p>

        {/* Hero — auto-narrated month story */}
        <StoryHero story={data.story} />

        {/* Coverage strip — three buckets at a glance, sticky on scroll */}
        <div className="sticky top-0 z-10 -mx-5 px-5 py-3 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200/70 dark:border-zinc-800/70 shadow-sm">
          <CoverageStrip coverage={data.coverage} />
        </div>

        {/* "How these numbers are calculated" — collapsible audit trail */}
        <div className="mt-4 mb-6">
          <MetricsExplainer />
        </div>

        {/* Pay / top-up CTAs — visible above the fold so stakeholders can act */}
        <PaymentCTAs
          pendingUrl={payoneer.pending}
          topupUrl={payoneer.topup}
          rate={payoneer.rate}
          hoursRemaining={meter.hours_remaining}
          pctUsed={meter.pct_used}
          hasPendingChangeOrder={hasPendingChangeOrder}
        />

        {/* Row 1: credit meter + payment status */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Service Credit · {meter.month}
              </h2>
              <PaymentBadge payment={data.payment} />
            </div>
            <div className="text-4xl font-bold tracking-tight tabular-nums leading-tight">
              {meter.hours_used.toFixed(1)}
              <span className="text-base font-medium text-zinc-500 dark:text-zinc-400 ml-1">/ {meter.cap_hours} hrs used</span>
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
              {meter.hours_remaining.toFixed(1)} hrs remaining this month ·{' '}
              {meter.overage_hours > 0 ? <span className="text-rose-600 dark:text-rose-400 font-medium">{meter.overage_hours.toFixed(1)} hrs overage at $90/hr</span> : 'No overage'}
            </div>
            <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 mt-5 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${Math.min(meter.pct_used, 100)}%`, background: meterGradient }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
              <span>0 hrs</span>
              <span>{meter.cap_hours} hrs cap</span>
            </div>

            <Burndown
              days={data.coverage.burndown_days}
              cap={meter.cap_hours}
              daysInMonth={data.story.days_total}
            />
          </section>

          {/* Payment + Contract summary card */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
              Contract Summary
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Monthly retainer</span>
                <span className="text-sm font-semibold tabular-nums">$1,500</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Hours included</span>
                <span className="text-sm font-semibold tabular-nums">{meter.cap_hours} hrs</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Overage rate</span>
                <span className="text-sm font-semibold tabular-nums">$90/hr</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Warranty window</span>
                <span className="text-sm font-semibold tabular-nums">30 days per fix</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Hours used today</span>
                <span className={`text-sm font-semibold tabular-nums ${meterColor === 'rose' ? 'text-rose-600 dark:text-rose-400' : meterColor === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {meter.hours_used.toFixed(1)} / {meter.cap_hours}
                </span>
              </div>
            </div>

            {/* Month-over-month trend */}
            {data.coverage.prev_service_contract_hours > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  <span className="uppercase tracking-wider font-semibold">vs last month</span>
                  <span>same-day comparison</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(() => {
                    const hoursDiff = data.coverage.service_contract_hours_used - data.coverage.prev_service_contract_hours
                    const warrantyDiff = data.coverage.warranty_active_count - data.coverage.prev_warranty_active_count
                    const coDiff = (data.coverage.change_order_open_usd + data.coverage.change_order_shipped_usd) - data.coverage.prev_change_order_total_usd
                    return (
                      <>
                        <div>
                          <div className={`text-sm font-bold tabular-nums ${hoursDiff > 0 ? 'text-amber-600 dark:text-amber-400' : hoursDiff < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {hoursDiff > 0 ? '+' : ''}{hoursDiff.toFixed(1)}h
                          </div>
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">contract hours</div>
                        </div>
                        <div>
                          <div className={`text-sm font-bold tabular-nums ${warrantyDiff > 0 ? 'text-emerald-600 dark:text-emerald-400' : warrantyDiff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {warrantyDiff > 0 ? '+' : ''}{warrantyDiff}
                          </div>
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">warranty fixes</div>
                        </div>
                        <div>
                          <div className={`text-sm font-bold tabular-nums ${coDiff > 0 ? 'text-amber-600 dark:text-amber-400' : coDiff < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {coDiff > 0 ? '+' : ''}{coDiff >= 1000 ? '$' + (coDiff / 1000).toFixed(1) + 'k' : '$' + Math.round(Math.abs(coDiff)).toLocaleString('en-US')}
                          </div>
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">CO value</div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Active warranties mini-list */}
            {data.warranty_items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Active warranties
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    30-day clock per shipped fix
                  </span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.warranty_items.map((w) => (
                    <div key={w.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm leading-snug truncate">{w.summary}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {fmtDate(w.shipped_at)}{w.repo ? ` · ${w.repo}` : ''}
                        </div>
                      </div>
                      <WarrantyCountdown shippedAt={w.shipped_at} expiresAt={w.warranty_expires} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Row 2: covered/not-covered + recently shipped */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              What&apos;s covered each month
            </h2>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {COVERED_CLAUSES.map((c) => (
                <div key={c.title} className="flex gap-3 py-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center text-xs font-bold mt-0.5">
                    ✓
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.title}</div>
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
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center text-xs font-bold mt-0.5">
                      −
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.title}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
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

        {/* Row 3: live activity + per-platform breakdown */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <ActivityTicker events={data.activity} />
          <PlatformBreakdown platforms={data.platforms} />
        </div>

        {/* Gray Areas — the honest middle */}
        <div className="mb-4">
          <GrayAreas
            clauses={GRAY_AREA_CLAUSES}
            liveItems={data.triaged_requests
              .filter((r) => r.classification === 'MIXED' && r.status !== 'shipped' && r.status !== 'cancelled')
              .map((r) => ({
                id: r.id,
                summary: r.summary,
                requester: r.requester,
                status: r.status,
              }))}
          />
        </div>

        {/* Row 4: tabbed views — Overview / Kanban / List / By stakeholder */}
        <TransparencyTabs triaged={data.triaged_requests} changeOrderQueue={data.change_order_queue} />

        <footer className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-12">
          ANC Sports · Standard service contract · $1,500/mo · 12 hrs included · 30-day warranty on shipped work · $90/hr overage<br />
          Quotes for new work derived from US market median → outsourcing efficiency → contract rate → long-term-partner adjustment. Click any request row above to see the chain.
        </footer>
      </div>
    </div>
  )
}
