'use client'

import { useEffect, useState } from 'react'

interface BreakdownStep {
  label: string
  value: number
  unit: string
  basis?: string
}

interface MarketBreakdown {
  workType: string
  scope: string
  steps: BreakdownStep[]
  finalUSD: number
  finalHours: number
}

interface Comparable {
  summary: string
  usd: number
  shipped_at: string | null
}

function fmtUSD(n: number): string {
  if (!n) return '—'
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n)
}

interface Props {
  breakdown: MarketBreakdown | null
  workType: string | null
  /** Optionally fetch comparables when the component mounts */
  fetchComparables?: boolean
}

export default function PricingTransparency({ breakdown, workType, fetchComparables = true }: Props) {
  const [comparables, setComparables] = useState<Comparable[]>([])
  const [loadingComparables, setLoadingComparables] = useState(false)

  useEffect(() => {
    if (!fetchComparables) return
    setLoadingComparables(true)
    fetch('/api/service-triage?retainer=false&limit=20')
      .then(r => r.json())
      .then(d => {
        const items = (d.requests || []) as Array<{ summary: string; quote_amount: number | null; paid_amount: number | null; estimated_usd: number | null; shipped_at: string | null; status: string }>
        const past = items
          .filter(i => i.status === 'shipped' || i.status === 'paid')
          .map(i => ({
            summary: i.summary,
            usd: Number(i.paid_amount || i.quote_amount || i.estimated_usd || 0),
            shipped_at: i.shipped_at,
          }))
          .filter(i => i.usd > 0)
          .slice(0, 5)
        setComparables(past)
      })
      .finally(() => setLoadingComparables(false))
  }, [fetchComparables])

  if (!breakdown) {
    return (
      <section className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-2">
          Pricing breakdown
        </div>
        <p className="text-xs text-amber-900 dark:text-amber-200">
          This card was added manually — no AI breakdown available. The price reflects Ahmad&apos;s direct estimate.
        </p>
      </section>
    )
  }

  const steps = breakdown.steps || []

  return (
    <section className="rounded-xl border-2 border-blue-200 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/20 p-5">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-blue-900 dark:text-blue-100">
          Pricing transparency
        </h2>
        <span className="text-[10px] text-blue-700/70 dark:text-blue-300/70 uppercase tracking-wider">
          {breakdown.workType?.replace(/_/g, ' ')} · {breakdown.scope} scope
        </span>
      </div>

      {/* The 4-step chain */}
      <div className="space-y-2 mb-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0A52EF] text-white text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-blue-900 dark:text-blue-100">{step.label}</div>
              {step.basis && (
                <div className="text-[10px] text-blue-700/70 dark:text-blue-300/70 leading-tight">{step.basis}</div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold tabular-nums text-blue-900 dark:text-blue-100">
                {step.unit === 'usd' ? fmtUSD(step.value) : step.unit === 'hours' ? `${step.value}h` : step.value.toFixed(2) + '×'}
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2 mt-2 border-t-2 border-blue-300 dark:border-blue-700">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
            ✓
          </div>
          <div className="flex-1 text-sm font-bold text-emerald-900 dark:text-emerald-100">
            Final price
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtUSD(breakdown.finalUSD)}
            </div>
            <div className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">{breakdown.finalHours}h</div>
          </div>
        </div>
      </div>

      {/* Comparables */}
      <div className="border-t border-blue-200 dark:border-blue-800/60 pt-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-800 dark:text-blue-300 mb-2">
          Comparable past work
        </div>
        {loadingComparables ? (
          <div className="text-[11px] text-blue-700/60 dark:text-blue-300/60 italic">Loading similar projects…</div>
        ) : comparables.length === 0 ? (
          <div className="text-[11px] text-blue-700/60 dark:text-blue-300/60 italic">
            No similar past work delivered yet. As more change orders ship, this section will show
            anchored prices from real ANC projects.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {comparables.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-blue-700 dark:text-blue-300/80 line-clamp-1 flex-1 min-w-0">{c.summary}</span>
                <span className="font-bold tabular-nums text-blue-900 dark:text-blue-100 flex-shrink-0">
                  {fmtUSD(c.usd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Disclaimer — Ahmad reviews */}
      <div className="rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-base leading-none flex-shrink-0">⚠️</span>
          <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
            <strong>Planning estimate only.</strong> This is an AI-assisted estimate based on US market rates, the ANC service-contract relationship, and similar past work. Ahmad confirms the final scope and price before work starts, and the number may move up or down based on actual complexity, integration risk, or timing.
          </p>
        </div>
      </div>
    </section>
  )
}
