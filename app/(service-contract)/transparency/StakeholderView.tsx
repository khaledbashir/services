'use client'

import { useMemo } from 'react'

interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimated_usd: number | null
  shipped_at: string | null
  actual_hours: number | null
}

interface Props {
  requests: TriagedRequest[]
}

interface StakeholderBucket {
  name: string
  total: number
  shippedCount: number
  openCount: number
  contractHours: number
  changeOrderUsd: number
  rows: TriagedRequest[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

const STATUS_LABEL: Record<string, string> = {
  open: 'open',
  in_progress: 'in progress',
  quoted: 'quoted',
  shipped: 'shipped',
}

export default function StakeholderView({ requests }: Props) {
  const buckets = useMemo<StakeholderBucket[]>(() => {
    const map = new Map<string, StakeholderBucket>()
    for (const r of requests) {
      const name = r.requester || '— unattributed —'
      let b = map.get(name)
      if (!b) {
        b = {
          name,
          total: 0,
          shippedCount: 0,
          openCount: 0,
          contractHours: 0,
          changeOrderUsd: 0,
          rows: [],
        }
        map.set(name, b)
      }
      b.total += 1
      b.rows.push(r)
      if (r.status === 'shipped') b.shippedCount += 1
      else b.openCount += 1
      const isContractFix = r.classification === 'FIX' && r.retainer_covered
      if (isContractFix && r.status === 'shipped' && r.actual_hours != null) {
        b.contractHours += r.actual_hours
      }
      if (!isContractFix && r.estimated_usd) {
        b.changeOrderUsd += r.estimated_usd
      }
    }
    // sort each bucket's rows newest-first, sort buckets by total DESC
    for (const b of map.values()) {
      b.rows.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [requests])

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm text-gray-400 dark:text-gray-500 italic text-sm text-center">
        No requests yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {buckets.map((b) => (
        <section
          key={b.name}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
        >
          <header className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/60">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300">
              {b.name.startsWith('—') ? '?' : initials(b.name)}
            </span>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{b.name}</h3>
            <div className="flex items-center gap-3 ml-auto text-[11px] text-gray-600 dark:text-gray-400 tabular-nums">
              <span>
                <strong className="text-gray-800 dark:text-gray-200">{b.total}</strong> total
              </span>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span>
                <strong className="text-emerald-700 dark:text-emerald-400">{b.shippedCount}</strong> shipped
              </span>
              <span>
                <strong className="text-gray-700 dark:text-gray-300">{b.openCount}</strong> open
              </span>
              {b.contractHours > 0 ? (
                <>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="text-blue-700 dark:text-blue-400">
                    {b.contractHours.toFixed(1)}h contract
                  </span>
                </>
              ) : null}
              {b.changeOrderUsd > 0 ? (
                <>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="text-amber-700 dark:text-amber-400">{fmtUSD(b.changeOrderUsd)} CO</span>
                </>
              ) : null}
            </div>
          </header>

          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {b.rows.map((r) => {
              const isContractFix = r.classification === 'FIX' && r.retainer_covered
              const stripe = isContractFix
                ? 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/10'
              const hours =
                r.status === 'shipped' && r.actual_hours != null ? r.actual_hours : r.estimated_hours
              return (
                <li
                  key={r.id}
                  className={`px-4 py-2.5 flex items-start gap-3 border-l-4 ${stripe}`}
                >
                  <div className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap pt-0.5 w-12">
                    {fmtDate(r.received_at)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded ${
                          isContractFix
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                        }`}
                      >
                        {isContractFix ? 'CONTRACT' : 'CO'}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <div className="text-xs leading-snug text-gray-700 dark:text-gray-300 line-clamp-2">
                      {r.summary}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap text-[11px] font-mono tabular-nums text-gray-600 dark:text-gray-400">
                    {hours != null ? `${hours.toFixed(1)}h` : ''}
                    {r.estimated_usd != null ? (
                      <div className="text-[10px] text-amber-700 dark:text-amber-400">
                        {fmtUSD(r.estimated_usd)}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
