'use client'

import { useState } from 'react'

interface BreakdownStep {
  label: string
  hours?: number
  rateUSD?: number
  totalUSD?: number
  detail?: string
}

interface MarketBreakdown {
  workType: string
  workTypeLabel: string
  scope: string
  breakdown: BreakdownStep[]
  finalHours: number
  finalUSD: number
  sources: string[]
}

interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimate_basis: string | null
  estimated_usd: number | null
  market_breakdown: MarketBreakdown | null
  shipped_at: string | null
  actual_hours: number | null
}

interface Props {
  requests: TriagedRequest[]
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

const CLASSIFICATION_TONE: Record<string, string> = {
  FIX:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  NEW:   'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
  MIXED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
}

const STATUS_TONE: Record<string, string> = {
  open:        'bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  shipped:     'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  quoted:      'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  cancelled:   'bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
}

export default function RequestTimeline({ requests }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (requests.length === 0) {
    return (
      <div className="text-zinc-400 dark:text-zinc-500 text-sm italic py-3">
        No requests in the last 60 days. New asks will land here as they come in.
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {requests.map((r) => {
        const isOpen = openId === r.id
        const hours = r.status === 'shipped' && r.actual_hours != null ? r.actual_hours : r.estimated_hours
        const usd = r.estimated_usd
        const breakdown = r.market_breakdown

        return (
          <div key={r.id} className="py-3.5">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : r.id)}
              className="w-full text-left flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded-md -mx-2 px-2 py-1 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex-shrink-0 w-12 text-center">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{fmtDate(r.received_at)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${CLASSIFICATION_TONE[r.classification] || ''}`}>
                    {r.classification}
                  </span>
                  <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_TONE[r.status] || ''}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  {r.requester ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">from {r.requester}</span>
                  ) : null}
                </div>
                <div className="text-sm mt-1 leading-snug">{r.summary}</div>
              </div>
              <div className="flex-shrink-0 text-right">
                {hours != null ? (
                  <div className="text-sm font-mono tabular-nums font-semibold">{hours.toFixed(1)}h</div>
                ) : null}
                {usd != null ? (
                  <div className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">{fmtUSD(usd)}</div>
                ) : null}
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{isOpen ? '▾' : '▸'} why</div>
              </div>
            </button>

            {isOpen ? (
              <div className="mt-3 ml-15 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-2 text-xs">
                {r.retainer_covered ? (
                  <div className="text-zinc-600 dark:text-zinc-400">
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">Retainer-covered fix · estimate from past similar work</div>
                    <div className="mt-1">{r.estimate_basis || 'No basis recorded.'}</div>
                  </div>
                ) : breakdown ? (
                  <div>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Change-order quote · {breakdown.workTypeLabel}
                    </div>
                    <div className="mt-2 space-y-2">
                      {breakdown.breakdown.map((step, i) => (
                        <div key={i} className="border-l-2 border-zinc-200 dark:border-zinc-700 pl-2">
                          <div className="font-medium text-zinc-700 dark:text-zinc-300">
                            {i + 1}. {step.label}
                          </div>
                          <div className="text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono tabular-nums">
                            {step.hours != null ? <span className="mr-3">{step.hours}h</span> : null}
                            {step.rateUSD != null ? <span className="mr-3">@ ${step.rateUSD}/hr</span> : null}
                            {step.totalUSD != null ? <span className="font-semibold">= ${step.totalUSD.toLocaleString('en-US')}</span> : null}
                          </div>
                          {step.detail ? (
                            <div className="text-zinc-500 dark:text-zinc-500 mt-0.5">{step.detail}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between font-semibold text-zinc-700 dark:text-zinc-300">
                      <span>Final ANC quote</span>
                      <span className="font-mono tabular-nums">{breakdown.finalHours}h · ${breakdown.finalUSD.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-600 dark:text-zinc-400">
                    {r.estimate_basis || 'No detailed breakdown available.'}
                  </div>
                )}

                {r.shipped_at ? (
                  <div className="text-zinc-500 dark:text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    Shipped {fmtDate(r.shipped_at)}{r.actual_hours != null ? ` in ${r.actual_hours}h` : ''}.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
