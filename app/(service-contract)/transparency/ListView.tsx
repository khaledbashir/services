'use client'

import { useMemo, useState } from 'react'

interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  classification_confidence: number | null
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimated_usd: number | null
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
}

interface Props {
  requests: TriagedRequest[]
}

type SortKey = 'received_at' | 'type' | 'requester' | 'hours' | 'usd' | 'status'

const REPO_TO_GITHUB: Record<string, string> = {
  'anc-services': 'khaledbashir/services',
  'rag2': 'khaledbashir/rag2',
  'twenty-crm': 'twentyhq/twenty',
  'anc-kb': 'bashhh89/anc-kb',
  'crmdocs': 'bashhh89/crmdocs',
  'openclaw': 'khaledbashir/openclaw',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null) return ''
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function coverage(r: TriagedRequest): { label: string; tone: string } {
  if (r.classification === 'NEW' || r.classification === 'MIXED' || !r.retainer_covered) {
    return { label: 'CO', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' }
  }
  return { label: 'CONTRACT', tone: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
}

const STATUS_ORDER: Record<string, number> = {
  open: 0,
  in_progress: 1,
  quoted: 2,
  shipped: 3,
}

export default function ListView({ requests }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('received_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')

  const filtered = useMemo(() => {
    return requests
      .filter((r) => {
        if (filterStatus && r.status !== filterStatus) return false
        const cov = coverage(r).label
        if (filterType && cov !== filterType) return false
        if (searchText) {
          const q = searchText.toLowerCase()
          const hay = (r.summary + ' ' + (r.requester || '')).toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        let av: number | string = 0
        let bv: number | string = 0
        switch (sortKey) {
          case 'received_at':
            av = new Date(a.received_at).getTime()
            bv = new Date(b.received_at).getTime()
            break
          case 'type':
            av = coverage(a).label
            bv = coverage(b).label
            break
          case 'requester':
            av = (a.requester || '').toLowerCase()
            bv = (b.requester || '').toLowerCase()
            break
          case 'hours': {
            av = a.status === 'shipped' && a.actual_hours != null ? a.actual_hours : a.estimated_hours ?? -1
            bv = b.status === 'shipped' && b.actual_hours != null ? b.actual_hours : b.estimated_hours ?? -1
            break
          }
          case 'usd':
            av = a.estimated_usd ?? -1
            bv = b.estimated_usd ?? -1
            break
          case 'status':
            av = STATUS_ORDER[a.status] ?? 99
            bv = STATUS_ORDER[b.status] ?? 99
            break
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [requests, sortKey, sortDir, searchText, filterStatus, filterType])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'received_at' || key === 'usd' || key === 'hours' ? 'desc' : 'asc')
    }
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const totalHours = filtered.reduce((sum, r) => {
    const h = r.status === 'shipped' && r.actual_hours != null ? r.actual_hours : 0
    return sum + h
  }, 0)
  const totalUsd = filtered.reduce((sum, r) => sum + (r.estimated_usd || 0), 0)

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800">
        <input
          type="text"
          placeholder="Search summary or requester…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1 min-w-[200px] text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 outline-none"
        >
          <option value="">All types</option>
          <option value="CONTRACT">Service Contract</option>
          <option value="CO">Change Order</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 outline-none"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="quoted">Quoted</option>
          <option value="shipped">Shipped</option>
        </select>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums ml-auto">
          {filtered.length} of {requests.length} · Σ {totalHours.toFixed(1)}h
          {totalUsd > 0 ? ` · ${fmtUSD(totalUsd)}` : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-900/60">
            <tr>
              <Th onClick={() => toggleSort('received_at')}>Date{arrow('received_at')}</Th>
              <Th onClick={() => toggleSort('type')}>Type{arrow('type')}</Th>
              <Th onClick={() => toggleSort('requester')}>From{arrow('requester')}</Th>
              <th className="px-3 py-2 text-left font-semibold">Summary</th>
              <Th onClick={() => toggleSort('hours')} align="right">Hours{arrow('hours')}</Th>
              <Th onClick={() => toggleSort('usd')} align="right">$ quote{arrow('usd')}</Th>
              <Th onClick={() => toggleSort('status')}>Status{arrow('status')}</Th>
              <th className="px-3 py-2 text-left font-semibold">Ship</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 italic">
                  No requests match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const cov = coverage(r)
                const hours = r.status === 'shipped' && r.actual_hours != null ? r.actual_hours : r.estimated_hours
                const slug = r.repo ? REPO_TO_GITHUB[r.repo] : null
                const sha = r.shipped_commit_sha
                return (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {fmtDate(r.received_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cov.tone}`}>
                        {cov.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {r.requester || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs leading-snug max-w-md text-gray-700 dark:text-gray-300">
                      <div className="line-clamp-2">{r.summary}</div>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                      {hours != null ? hours.toFixed(1) + 'h' : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                      {fmtUSD(r.estimated_usd)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {slug && sha ? (
                        <a
                          href={`https://github.com/${slug}/commit/${sha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline"
                          title={`commit ${sha}`}
                        >
                          ↗ {sha.slice(0, 7)}
                        </a>
                      ) : r.shipped_at ? (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtDate(r.shipped_at)}</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Th({
  children,
  onClick,
  align = 'left',
}: {
  children: React.ReactNode
  onClick?: () => void
  align?: 'left' | 'right'
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-semibold ${
        onClick ? 'cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 select-none' : ''
      }`}
    >
      {children}
    </th>
  )
}
