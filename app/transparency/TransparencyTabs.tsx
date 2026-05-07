'use client'

import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import RequestTimeline from './RequestTimeline'
import ChangeOrderQueue from './ChangeOrderQueue'
import KanbanView from './KanbanView'
import ListView from './ListView'
import StakeholderView from './StakeholderView'
import FilterBar, { FilterState, applyFilters, parseFiltersFromUrl } from './FilterBar'

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
  estimated_hours: number | null
  estimate_basis: string | null
  estimated_usd: number | null
  market_breakdown: any | null
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
  area: string | null
}

interface Props {
  triaged: TriagedRequest[]
  changeOrderQueue: TriagedRequest[]
}

type ViewKey = 'overview' | 'kanban' | 'list' | 'stakeholder'

const TABS: Array<{ key: ViewKey; label: string; hint: string }> = [
  { key: 'overview',    label: 'Overview',       hint: 'CO queue + timeline' },
  { key: 'kanban',      label: 'Kanban',         hint: 'drag between status columns' },
  { key: 'list',        label: 'List',           hint: 'sortable dense table' },
  { key: 'stakeholder', label: 'By stakeholder', hint: 'grouped by requester' },
]

type SortKey = 'newest' | 'oldest' | 'hours-desc' | 'hours-asc' | 'usd-desc' | 'status'

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest',     label: 'Newest first' },
  { key: 'oldest',     label: 'Oldest first' },
  { key: 'hours-desc', label: 'Most hours' },
  { key: 'hours-asc',  label: 'Fewest hours' },
  { key: 'usd-desc',   label: 'Highest $ quote' },
  { key: 'status',     label: 'By status' },
]

const STATUS_RANK: Record<string, number> = { open: 0, in_progress: 1, quoted: 2, shipped: 3 }

function sortRows<T extends {
  received_at: string
  estimated_hours: number | null
  actual_hours: number | null
  estimated_usd: number | null
  status: string
}>(rows: T[], sort: SortKey): T[] {
  const arr = [...rows]
  switch (sort) {
    case 'newest':
      return arr.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    case 'oldest':
      return arr.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
    case 'hours-desc':
      return arr.sort((a, b) => {
        const ah = a.status === 'shipped' && a.actual_hours != null ? a.actual_hours : a.estimated_hours ?? -1
        const bh = b.status === 'shipped' && b.actual_hours != null ? b.actual_hours : b.estimated_hours ?? -1
        return bh - ah
      })
    case 'hours-asc':
      return arr.sort((a, b) => {
        const ah = a.status === 'shipped' && a.actual_hours != null ? a.actual_hours : a.estimated_hours ?? Infinity
        const bh = b.status === 'shipped' && b.actual_hours != null ? b.actual_hours : b.estimated_hours ?? Infinity
        return ah - bh
      })
    case 'usd-desc':
      return arr.sort((a, b) => (b.estimated_usd ?? -1) - (a.estimated_usd ?? -1))
    case 'status':
      return arr.sort((a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99))
  }
}

export default function TransparencyTabs({ triaged, changeOrderQueue }: Props) {
  const [view, setView] = useState<ViewKey>('overview')
  const [sort, setSort] = useState<SortKey>('newest')
  const searchParams = useSearchParams()

  // Filter state — read from URL on first render so links are shareable.
  const [filters, setFilters] = useState<FilterState>(() => parseFiltersFromUrl(searchParams))

  // Re-parse if the URL changes externally (back/forward, paste new link)
  useEffect(() => {
    setFilters(parseFiltersFromUrl(searchParams))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  const allStakeholders = useMemo(() => {
    const s = new Set<string>()
    triaged.forEach((r) => s.add(r.requester || '— unattributed —'))
    return Array.from(s).sort()
  }, [triaged])

  const allPlatforms = useMemo(() => {
    const s = new Set<string>()
    triaged.forEach((r) => s.add(r.repo || 'other'))
    return Array.from(s).sort()
  }, [triaged])

  const filteredTriaged = useMemo(() => sortRows(applyFilters(triaged, filters), sort), [triaged, filters, sort])
  const filteredCoQueue = useMemo(() => sortRows(applyFilters(changeOrderQueue, filters), sort), [changeOrderQueue, filters, sort])

  return (
    <div className="space-y-4">
      <FilterBar
        allStakeholders={allStakeholders}
        allPlatforms={allPlatforms}
        initial={filters}
        onChange={setFilters}
      />

      {/* Result count + sort */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 px-1 flex-wrap">
        <span className="tabular-nums">
          Showing <strong className="text-zinc-700 dark:text-zinc-300">{filteredTriaged.length}</strong> of {triaged.length} requests
          {filteredTriaged.length !== triaged.length ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-1.5" data-no-print="true">
          <span className="text-[10px] uppercase tracking-wider">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-[11px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const active = view === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
              aria-pressed={active}
            >
              {t.label}
              {active ? (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              ) : null}
            </button>
          )
        })}
        <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 hidden md:inline pr-2">
          {TABS.find((t) => t.key === view)?.hint}
        </span>
      </div>

      {/* Active view */}
      {view === 'overview' ? (
        <div className="space-y-4">
          <ChangeOrderQueue
            items={filteredCoQueue.map((r) => ({
              id: r.id,
              received_at: r.received_at,
              requester: r.requester,
              summary: r.summary,
              classification: r.classification,
              status: r.status,
              estimated_hours: r.estimated_hours,
              estimated_usd: r.estimated_usd,
            }))}
          />
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Request timeline
              </h2>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                click any row for the why
              </span>
            </div>
            <RequestTimeline requests={filteredTriaged} />
          </section>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView requests={filteredTriaged} />
      ) : view === 'list' ? (
        <ListView requests={filteredTriaged} />
      ) : (
        <StakeholderView requests={filteredTriaged} />
      )}
    </div>
  )
}
