'use client'

import { useState } from 'react'

interface ChainComparable {
  id: string
  summary: string
  actual_hours: number
  shipped_at: string
}

interface ChainPayload {
  method?: string
  comparables?: ChainComparable[]
  bucket?: string
  bucket_reason?: string
  files_touched?: number
  lines_added?: number
  lines_removed?: number
  commit_sha?: string
}

interface Props {
  classification: 'FIX' | 'NEW' | 'MIXED'
  confidence: number | null
  classification_basis: string | null
  estimate_basis: string | null
  estimate_basis_chain?: ChainPayload | null
  retainer_covered: boolean
  area: string | null
  repo: string | null
  estimated_hours: number | null
  actual_hours: number | null
  status: string
  isAdmin?: boolean
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100))
  const tone =
    score >= 8 ? 'bg-emerald-500' :
    score >= 5 ? 'bg-amber-500' :
    'bg-rose-500'
  const label =
    score >= 8 ? 'reviewed' :
    score >= 5 ? 'needs review' :
    'needs human review'
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-12 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-gray-500 dark:text-gray-400">
        {label}
      </span>
    </div>
  )
}

export default function Rationale({
  classification,
  confidence,
  classification_basis,
  estimate_basis,
  estimate_basis_chain,
  retainer_covered,
  area,
  repo,
  estimated_hours,
  actual_hours,
  status,
  isAdmin = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const isCO = classification === 'NEW' || classification === 'MIXED' || !retainer_covered

  return (
    <div className="mt-2 rounded-lg border border-gray-200/60 dark:border-gray-800/60 bg-gray-50/40 dark:bg-gray-950/40">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-gray-100/50 dark:hover:bg-gray-900/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            How this is counted
          </span>
          {isAdmin && confidence != null ? <ConfidenceBar score={confidence} /> : null}
          <span className="text-gray-400 dark:text-gray-600">·</span>
          <span className="text-gray-600 dark:text-gray-400">
            counted as <strong className={isCO ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}>{isCO ? 'change order' : 'service contract'}</strong>
          </span>
          {area ? (
            <>
              <span className="text-gray-400 dark:text-gray-600">·</span>
              <span className="text-gray-500 dark:text-gray-500">area: {area}</span>
            </>
          ) : null}
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-[11px]">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] leading-snug">
          {/* Why this classification */}
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
              Why {isCO ? 'change order' : 'service contract'}
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              {classification_basis || 'No basis recorded for this classification.'}
            </div>
          </div>

          {/* Why this estimate — deterministic formula + comparable chain */}
          {estimated_hours != null || estimate_basis ? (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
                Why this estimate
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                {estimate_basis || 'Baseline estimate — no comparable history yet.'}
              </div>

              {/* Comparable past deliveries — the actual audit chain */}
              {estimate_basis_chain?.comparables && estimate_basis_chain.comparables.length > 0 ? (
                <div className="mt-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-500 mb-1 font-semibold">
                    {estimate_basis_chain.method === 'db_priors'
                      ? `Median of ${estimate_basis_chain.comparables.length} comparable past deliveries`
                      : `${estimate_basis_chain.comparables.length} prior in-ledger (below threshold, using baseline)`}
                  </div>
                  <ul className="space-y-0.5">
                    {estimate_basis_chain.comparables.slice(0, 5).map((c) => (
                      <li key={c.id} className="text-[10px] font-mono flex gap-2 items-baseline">
                        <span className="text-gray-500 dark:text-gray-500 w-20 shrink-0">{c.shipped_at}</span>
                        <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{c.summary}</span>
                        <span className="text-gray-900 dark:text-gray-100 font-semibold shrink-0">
                          {c.actual_hours.toFixed(2)}h
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {estimated_hours != null ? (
                <div className="mt-1 text-gray-500 dark:text-gray-500 font-mono tabular-nums">
                  Estimate: {estimated_hours.toFixed(1)}h
                  {actual_hours != null && status === 'shipped' ? (
                    <>
                      {' · '}
                      Actual: <strong className={actual_hours <= estimated_hours ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{actual_hours.toFixed(1)}h</strong>
                      {' · '}
                      Variance: {((actual_hours - estimated_hours) / estimated_hours * 100).toFixed(0)}%
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* What gets it onto the retainer or off it */}
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
              How it lands on the bill
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              {isCO
                ? 'Out of contract scope — separately quoted at fixed price. Does not deduct from the 12-hr monthly retainer cap.'
                : 'In contract scope — actual hours deduct from the 12-hr monthly retainer cap. 30-day warranty applies once shipped.'}
              {repo ? <> Platform: <span className="font-medium text-gray-700 dark:text-gray-300">{repo}</span>.</> : null}
            </div>
          </div>

          {isAdmin && confidence != null && confidence < 5 ? (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 px-2 py-1.5 text-[10px] text-amber-800 dark:text-amber-300">
              <strong>Needs human review.</strong> The AI flagged this as a judgment call — say <em>reclassify as fix</em> or <em>reclassify as change order</em> if you disagree.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
