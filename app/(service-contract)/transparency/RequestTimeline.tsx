'use client'

import { useState } from 'react'
import Rationale from './Rationale'

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

interface EstimateBasisChain {
  method?: string
  comparables?: Array<{
    id: string
    summary: string
    actual_hours: number
    shipped_at: string
  }>
  bucket?: string
  bucket_reason?: string
  files_touched?: number
  lines_added?: number
  lines_removed?: number
  commit_sha?: string
}

interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  classification_confidence: number | null
  classification_basis: string | null
  status: string
  retainer_covered: boolean
  bucket?: string | null
  estimated_hours: number | null
  estimate_basis: string | null
  estimate_basis_chain?: EstimateBasisChain | null
  estimated_usd: number | null
  market_breakdown: MarketBreakdown | null
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
  area: string | null
}

const REPO_TO_GITHUB: Record<string, string> = {
  'anc-services': 'khaledbashir/services',
  'rag2': 'khaledbashir/rag2',
  'twenty-crm': 'twentyhq/twenty',
  'anc-kb': 'bashhh89/anc-kb',
  'crmdocs': 'bashhh89/crmdocs',
  'openclaw': 'khaledbashir/openclaw',
}

function commitUrl(repo: string | null, sha: string | null): string | null {
  if (!repo || !sha) return null
  const slug = REPO_TO_GITHUB[repo]
  if (!slug) return null
  return `https://github.com/${slug}/commit/${sha}`
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

interface Props {
  requests: TriagedRequest[]
  isAdmin?: boolean
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

// Coverage badge — what billing bucket this row lands in
const COVERAGE_TONE = {
  service_contract: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  change_order:     'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  warranty:         'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
}

function coverageLabel(r: TriagedRequest): { kind: 'service_contract' | 'change_order'; label: string } {
  if (r.classification === 'NEW' || r.classification === 'MIXED' || !r.retainer_covered) {
    return { kind: 'change_order', label: 'CHANGE ORDER' }
  }
  return { kind: 'service_contract', label: 'SERVICE CONTRACT' }
}

function warrantyDaysLeft(r: TriagedRequest): number | null {
  if (r.status !== 'shipped' || !r.shipped_at) return null
  if (r.classification !== 'FIX') return null
  const shipped = new Date(r.shipped_at).getTime()
  const expires = shipped + 30 * 86_400_000
  const days = Math.ceil((expires - Date.now()) / 86_400_000)
  return days > 0 ? days : null
}

const STATUS_TONE: Record<string, string> = {
  open:        'bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  shipped:     'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  quoted:      'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  cancelled:   'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-500',
}

export default function RequestTimeline({ requests, isAdmin = false }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (requests.length === 0) {
    return (
      <div className="text-gray-400 dark:text-gray-500 text-sm italic py-3">
        No requests in the last 60 days. New asks will land here as they come in.
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
              className="w-full text-left flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-md -mx-2 px-2 py-1 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex-shrink-0 w-12 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{fmtDate(r.received_at)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const cov = coverageLabel(r)
                    return (
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${COVERAGE_TONE[cov.kind]}`}>
                        {cov.label}
                      </span>
                    )
                  })()}
                  {(() => {
                    const wd = warrantyDaysLeft(r)
                    if (wd == null) return null
                    return (
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${COVERAGE_TONE.warranty}`}>
                        WARRANTY · {wd}d
                      </span>
                    )
                  })()}
                  <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_TONE[r.status] || ''}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  {r.requester ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">from {r.requester}</span>
                  ) : null}
                  {(() => {
                    const url = commitUrl(r.repo, r.shipped_commit_sha)
                    if (!url) return null
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline tabular-nums"
                        title={`View commit on GitHub · ${r.shipped_commit_sha?.slice(0, 7)}`}
                      >
                        ↗ {r.shipped_commit_sha?.slice(0, 7)}
                      </a>
                    )
                  })()}
                </div>
                <div className="text-sm mt-1 leading-snug">{r.summary}</div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Rationale
                    classification={r.classification}
                    confidence={r.classification_confidence}
                    classification_basis={r.classification_basis}
                    estimate_basis={r.estimate_basis}
                    estimate_basis_chain={r.estimate_basis_chain}
                    retainer_covered={r.retainer_covered}
                    area={r.area}
                    repo={r.repo}
                    estimated_hours={r.estimated_hours}
                    actual_hours={r.actual_hours}
                    status={r.status}
                    isAdmin={isAdmin}
                  />
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                {hours != null ? (
                  <div className="text-sm font-mono tabular-nums font-semibold">{hours.toFixed(1)}h</div>
                ) : null}
                {usd != null ? (
                  <div className="text-xs font-mono tabular-nums text-gray-500 dark:text-gray-400">{fmtUSD(usd)}</div>
                ) : null}
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{isOpen ? '▾' : '▸'} why</div>
              </div>
            </button>

            {isOpen ? (
              <div className="mt-3 ml-15 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                {r.retainer_covered ? (
                  <div className="text-gray-600 dark:text-gray-400">
                    <div className="font-semibold text-gray-700 dark:text-gray-300">Retainer-covered fix · estimate from past similar work</div>
                    <div className="mt-1">{r.estimate_basis || 'No basis recorded.'}</div>
                  </div>
                ) : breakdown ? (
                  <div>
                    <div className="font-semibold text-gray-700 dark:text-gray-300">
                      Change-order quote · {breakdown.workTypeLabel}
                    </div>
                    <div className="mt-2 space-y-2">
                      {breakdown.breakdown.map((step, i) => (
                        <div key={i} className="border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                          <div className="font-medium text-gray-700 dark:text-gray-300">
                            {i + 1}. {step.label}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 mt-0.5 font-mono tabular-nums">
                            {step.hours != null ? <span className="mr-3">{step.hours}h</span> : null}
                            {step.rateUSD != null ? <span className="mr-3">@ ${step.rateUSD}/hr</span> : null}
                            {step.totalUSD != null ? <span className="font-semibold">= ${step.totalUSD.toLocaleString('en-US')}</span> : null}
                          </div>
                          {step.detail ? (
                            <div className="text-gray-500 dark:text-gray-500 mt-0.5">{step.detail}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold text-gray-700 dark:text-gray-300">
                      <span>Final ANC quote</span>
                      <span className="font-mono tabular-nums">{breakdown.finalHours}h · ${breakdown.finalUSD.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-600 dark:text-gray-400">
                    {r.estimate_basis || 'No detailed breakdown available.'}
                  </div>
                )}

                {r.shipped_at ? (
                  <div className="text-gray-500 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
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
