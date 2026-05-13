'use client'

import { useEffect, useState } from 'react'

interface BreakdownStep {
  label: string
  value?: number
  unit?: string
  basis?: string
  hours?: number
  rateUSD?: number
  totalUSD?: number
  detail?: string
}

interface MarketBreakdown {
  workType: string
  scope: string
  steps?: BreakdownStep[]            // legacy field name
  breakdown?: BreakdownStep[]         // current field name from market-rate.ts
  finalUSD: number
  finalHours: number
  sources?: string[]
}

interface Comparable {
  summary: string
  usd: number
  shipped_at: string | null
  source: 'same_workType' | 'past_shipped'
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
    let cancelled = false
    setLoadingComparables(true)

    const run = async () => {
      const out: Comparable[] = []

      // Tier 1: proposed_change_orders filtered to same workType — like-for-like anchor.
      if (workType) {
        try {
          const r = await fetch(`/api/proposed-cos?work_type=${encodeURIComponent(workType)}`)
          const d = await r.json()
          const items = (d.items || []) as Array<{ name: string; price_usd: number | null; updated_at: string | null; is_placeholder?: boolean }>
          for (const i of items) {
            if (i.is_placeholder) continue
            const usd = Number(i.price_usd || 0)
            if (usd > 0) {
              out.push({ summary: i.name, usd, shipped_at: i.updated_at, source: 'same_workType' })
            }
          }
        } catch {}
      }

      // Tier 2: shipped/paid service_requests for additional history.
      if (out.length < 5) {
        try {
          const r = await fetch('/api/service-triage?retainer=false&limit=20')
          const d = await r.json()
          const items = (d.requests || []) as Array<{ summary: string; quote_amount: number | null; paid_amount: number | null; estimated_usd: number | null; shipped_at: string | null; status: string }>
          for (const i of items) {
            if (i.status !== 'shipped' && i.status !== 'paid') continue
            const usd = Number(i.paid_amount || i.quote_amount || i.estimated_usd || 0)
            if (usd > 0) {
              out.push({ summary: i.summary, usd, shipped_at: i.shipped_at, source: 'past_shipped' })
            }
            if (out.length >= 6) break
          }
        } catch {}
      }

      if (!cancelled) {
        setComparables(out.slice(0, 6))
        setLoadingComparables(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [fetchComparables, workType])

  if (!breakdown) {
    return (
      <section className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-2">
          Pricing breakdown
        </div>
        <p className="text-xs text-amber-900 dark:text-amber-200">
          This card was added manually, so no AI breakdown is available. The price reflects a direct scope estimate.
        </p>
      </section>
    )
  }

  // market-rate.ts emits breakdown[]; legacy rows may use steps[]
  const steps: BreakdownStep[] = breakdown.breakdown || breakdown.steps || []
  const sources = Array.isArray(breakdown.sources) ? breakdown.sources : []

  const stepRightValue = (s: BreakdownStep): string => {
    if (typeof s.totalUSD === 'number') return fmtUSD(s.totalUSD)
    if (typeof s.hours === 'number') return `${s.hours}h`
    if (typeof s.rateUSD === 'number') return `$${s.rateUSD}/hr`
    if (typeof s.value === 'number' && s.unit === 'usd') return fmtUSD(s.value)
    if (typeof s.value === 'number' && s.unit === 'hours') return `${s.value}h`
    if (typeof s.value === 'number') return s.value.toFixed(2) + '×'
    return ''
  }

  const stepSubtitle = (s: BreakdownStep): string => {
    if (s.detail) return s.detail
    if (s.basis) return s.basis
    // Helpful synthesized line for the US market step
    if (typeof s.hours === 'number' && typeof s.rateUSD === 'number') {
      return `${s.rateUSD} USD/hr × ${s.hours} hours`
    }
    return ''
  }

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
      <div className="space-y-3 mb-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0A52EF] text-white text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 leading-snug">{step.label}</div>
              {stepSubtitle(step) && (
                <div className="text-[10px] text-blue-700/70 dark:text-blue-300/70 leading-tight mt-0.5">{stepSubtitle(step)}</div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold tabular-nums text-blue-900 dark:text-blue-100">
                {stepRightValue(step)}
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

      {/* Sources strip — the citations that grounded steps 1 and 2 */}
      {sources.length > 0 && (
        <div className="border-t border-blue-200 dark:border-blue-800/60 pt-3 mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-800 dark:text-blue-300 mb-1.5">
            Market grounding
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800/40"
              >
                <span className="text-blue-500 dark:text-blue-400">◆</span> {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Comparables */}
      <div className="border-t border-blue-200 dark:border-blue-800/60 pt-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-800 dark:text-blue-300 mb-2">
          Comparable past work {workType ? <span className="text-blue-600/60 dark:text-blue-400/60 font-medium normal-case tracking-normal">· {workType.replace(/_/g, ' ')}</span> : null}
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
                <span className="flex-shrink-0 inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {c.source === 'same_workType' ? 'Same type' : 'Past ship'}
                </span>
                <span className="text-blue-700 dark:text-blue-300/80 line-clamp-1 flex-1 min-w-0">{c.summary}</span>
                <span className="font-bold tabular-nums text-blue-900 dark:text-blue-100 flex-shrink-0">
                  {fmtUSD(c.usd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Disclaimer — final review */}
      <div className="rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-base leading-none flex-shrink-0">⚠️</span>
          <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
            <strong>Planning estimate only.</strong> This is an AI-assisted estimate based on US market rates, the ANC service-contract context, and similar past work. Final scope and price are confirmed before work starts, and the number may move up or down based on actual complexity, integration risk, or timing.
          </p>
        </div>
      </div>
    </section>
  )
}
