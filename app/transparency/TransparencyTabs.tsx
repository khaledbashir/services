'use client'

import { useState } from 'react'
import RequestTimeline from './RequestTimeline'
import ChangeOrderQueue from './ChangeOrderQueue'
import KanbanView from './KanbanView'
import ListView from './ListView'
import StakeholderView from './StakeholderView'

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
  market_breakdown: any | null
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
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

export default function TransparencyTabs({ triaged, changeOrderQueue }: Props) {
  const [view, setView] = useState<ViewKey>('overview')

  return (
    <div className="space-y-4">
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
            items={changeOrderQueue.map((r) => ({
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
            <RequestTimeline requests={triaged} />
          </section>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView requests={triaged} />
      ) : view === 'list' ? (
        <ListView requests={triaged} />
      ) : (
        <StakeholderView requests={triaged} />
      )}
    </div>
  )
}
