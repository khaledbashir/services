'use client'

import { useState } from 'react'

const METRICS: Array<{ name: string; tone: 'blue' | 'emerald' | 'amber'; how: string }> = [
  {
    name: 'Service Contract hours',
    tone: 'blue',
    how:
      'Sum of actual_hours on every request where classification = FIX, retainer_covered = true, status = shipped, and shipped_at falls within the current calendar month. Counted once per shipped fix, recorded at ship-time, never re-estimated.',
  },
  {
    name: 'Warranty active count',
    tone: 'emerald',
    how:
      'Count of shipped FIX rows where shipped_at falls within the last 30 days. Each one carries a 30-day clock during which a regression on that same delivery is fixed at no charge — they appear here until the clock runs out.',
  },
  {
    name: 'Change Orders dollars',
    tone: 'amber',
    how:
      'Sum of estimated_usd across every NEW or MIXED request. Open-status rows are quotes awaiting approval; shipped rows are closed-out CO work. The number derives from a 4-step chain — US-market median → outsourcing efficiency factor → ANC contract rate → long-term-partner adjustment — visible per row in the rationale block.',
  },
  {
    name: '▲ / ▼ vs last month',
    tone: 'blue',
    how:
      'Compares this month-to-date against the same window of last month (e.g. May 1 through May 8 vs April 1 through April 8). An apples-to-apples read so you see pacing, not just totals.',
  },
  {
    name: 'Burndown line',
    tone: 'blue',
    how:
      'Daily cumulative hours used (solid line) plotted against a linear pace line (dashed) that hits 12 hrs by month-end. Solid above dashed = running heavy; below = lighter than pace.',
  },
  {
    name: 'Per-platform numbers',
    tone: 'amber',
    how:
      'Same retainer / warranty / CO logic as the headline strip, but grouped by the request\'s repo field. Tags: anc-services = Service Dashboard, rag2 = Proposal Engine, twenty-crm = CRM, openclaw = Slack Bot, anc-kb = Operator Docs.',
  },
]

const TONE: Record<string, string> = {
  blue:    'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20',
  emerald: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20',
  amber:   'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20',
}

export default function MetricsExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm" data-no-print="true">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-950 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-700 dark:text-zinc-300">
            How these numbers are calculated
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            click to open the audit trail for every metric on this page
          </span>
        </div>
        <span className="text-zinc-400 dark:text-zinc-500 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="px-4 pb-4 grid gap-2 md:grid-cols-2">
          {METRICS.map((m) => (
            <div
              key={m.name}
              className={`rounded-lg border ${TONE[m.tone]} p-3`}
            >
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                {m.name}
              </div>
              <div className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                {m.how}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
