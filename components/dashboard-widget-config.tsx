'use client'

import { useEffect, useState } from 'react'
import {
  DashboardWidget,
  WidgetFilters,
  WidgetGrouping,
  WidgetSort,
  WidgetSize,
  STATUS_LABEL,
  DUE_BUCKET_LABEL,
  DueBucket,
} from '@/lib/dashboard-widgets'

interface Props {
  widget: DashboardWidget | null
  staff: Array<{ id: string; full_name: string }>
  venues: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (widget: DashboardWidget) => void
}

const STATUS_KEYS: Array<keyof typeof STATUS_LABEL> = [
  'request_submitted', 'in_queue', 'in_progress', 'in_qc', 'client_review', 'approved', 'done',
]
const DUE_BUCKETS: DueBucket[] = ['overdue', 'today', 'tomorrow', 'this_week', 'next_week', 'later', 'no_due']

const GROUPING_OPTIONS: Array<{ value: WidgetGrouping; label: string }> = [
  { value: 'none', label: 'No grouping' },
  { value: 'due_bucket', label: 'By due-date bucket' },
  { value: 'status', label: 'By status' },
  { value: 'assignee', label: 'By assignee' },
  { value: 'venue', label: 'By venue' },
  { value: 'priority', label: 'By priority' },
]

const SORT_OPTIONS: Array<{ value: WidgetSort; label: string }> = [
  { value: 'due_asc', label: 'Due date — soonest first' },
  { value: 'due_desc', label: 'Due date — latest first' },
  { value: 'priority_first', label: 'Priority first, then newest' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const SIZE_OPTIONS: Array<{ value: WidgetSize; label: string }> = [
  { value: 'sm', label: 'Small (1/4 width)' },
  { value: 'md', label: 'Medium (1/3 width)' },
  { value: 'lg', label: 'Large (1/2 width)' },
  { value: 'xl', label: 'X-Large (2/3 width)' },
  { value: 'full', label: 'Full width' },
]

export function DashboardWidgetConfig({ widget, staff, venues, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<DashboardWidget | null>(widget)

  useEffect(() => { setDraft(widget) }, [widget])

  if (!draft) return null

  const setFilter = <K extends keyof WidgetFilters>(key: K, value: WidgetFilters[K]) => {
    setDraft({ ...draft, filters: { ...draft.filters, [key]: value } })
  }

  const toggleStatus = (status: string) => {
    const current = new Set(draft.filters.status || [])
    if (current.has(status)) current.delete(status)
    else current.add(status)
    setFilter('status', Array.from(current))
  }

  const toggleBucket = (bucket: DueBucket) => {
    const current = new Set(draft.filters.due_bucket || [])
    if (current.has(bucket)) current.delete(bucket)
    else current.add(bucket)
    setFilter('due_bucket', Array.from(current))
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-zinc-950/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="w-[480px] max-w-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Widget</div>
            <h2 className="text-base font-semibold text-zinc-900 mt-0.5">Configure</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Title</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Status (any if none picked)</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_KEYS.map((s) => {
                const active = draft.filters.status?.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 transition-colors ${
                      active
                        ? 'bg-[#0A52EF] text-white ring-[#0A52EF]'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-300'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Assignee</label>
            <select
              value={draft.filters.assignee || 'any'}
              onChange={(e) => setFilter('assignee', e.target.value as WidgetFilters['assignee'])}
              className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            >
              <option value="any">Any</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
              <option disabled>──────────</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Due date (any if none picked)</label>
            <div className="flex flex-wrap gap-1.5">
              {DUE_BUCKETS.map((b) => {
                const active = draft.filters.due_bucket?.includes(b)
                return (
                  <button
                    key={b}
                    onClick={() => toggleBucket(b)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 transition-colors ${
                      active
                        ? 'bg-[#0A52EF] text-white ring-[#0A52EF]'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-300'
                    }`}
                  >
                    {DUE_BUCKET_LABEL[b]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Venue</label>
            <select
              value={draft.filters.venue_id || 'any'}
              onChange={(e) => setFilter('venue_id', e.target.value === 'any' ? undefined : e.target.value)}
              className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            >
              <option value="any">Any venue</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Priority</label>
              <select
                value={draft.filters.priority || 'any'}
                onChange={(e) => setFilter('priority', e.target.value === 'any' ? undefined : 'high')}
                className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              >
                <option value="any">Any</option>
                <option value="high">High only</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Client / Internal</label>
              <select
                value={draft.filters.internal || 'any'}
                onChange={(e) => setFilter('internal', e.target.value === 'any' ? undefined : e.target.value as 'client' | 'internal')}
                className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              >
                <option value="any">Any</option>
                <option value="client">Client-billable only</option>
                <option value="internal">Internal-only</option>
              </select>
            </div>
          </div>

          <div className="border-t border-zinc-200/70 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Group by</label>
              <select
                value={draft.grouping}
                onChange={(e) => setDraft({ ...draft, grouping: e.target.value as WidgetGrouping })}
                className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              >
                {GROUPING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Sort</label>
              <select
                value={draft.sort}
                onChange={(e) => setDraft({ ...draft, sort: e.target.value as WidgetSort })}
                className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Size on the board</label>
            <select
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value as WidgetSize })}
              className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            >
              {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">Row limit</label>
            <input
              type="number"
              min={1}
              max={500}
              value={draft.limit || 50}
              onChange={(e) => setDraft({ ...draft, limit: Math.max(1, parseInt(e.target.value) || 50) })}
              className="w-full h-10 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-zinc-200 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="px-4 py-2 rounded-lg bg-[#0A52EF] text-white text-sm font-semibold hover:bg-[#0840C0]"
          >
            Save widget
          </button>
        </div>
      </div>
    </div>
  )
}
