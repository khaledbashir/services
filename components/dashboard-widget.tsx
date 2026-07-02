'use client'

import { ReactNode, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DashboardWidget,
  applyWidget,
  groupBy,
  STATUS_LABEL,
} from '@/lib/dashboard-widgets'

interface FilterableRequest {
  id: string
  status: string
  designer_id: string | null
  designer_name: string | null
  enterprise_contact_id: string | null
  enterprise_contact_name: string | null
  venue_id: string | null
  venue_name: string | null
  due_date: string | null
  priority?: string | null
  is_rando?: boolean
  internal_category?: string | null
  job_title: string
  company_name?: string | null
  tricode?: string | null
  created_date?: string
}

interface Props<T extends FilterableRequest> {
  widget: DashboardWidget
  items: T[]
  ctx: {
    currentUserId: string
    todayIso: string
    staffById: Record<string, string>
    venueById: Record<string, string>
  }
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
  isFirst?: boolean
  isLast?: boolean
}

const SIZE_CLASS: Record<DashboardWidget['size'], string> = {
  sm: 'lg:col-span-3',
  md: 'lg:col-span-4',
  lg: 'lg:col-span-6',
  xl: 'lg:col-span-8',
  full: 'lg:col-span-12',
}

function dueTone(due: string | null, todayIso: string): string {
  if (!due) return 'text-zinc-400'
  const d = String(due).slice(0, 10)
  if (d < todayIso) return 'text-rose-600 font-semibold'
  if (d === todayIso) return 'text-amber-600 font-semibold'
  return 'text-zinc-500'
}

function initials(name: string | null): string {
  if (!name) return '–'
  return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABEL[status] || status
  const tone: Record<string, string> = {
    request_submitted: 'bg-zinc-100 text-zinc-700',
    in_queue: 'bg-violet-50 text-violet-700',
    in_progress: 'bg-amber-50 text-amber-700',
    in_qc: 'bg-blue-50 text-blue-700',
    client_review: 'bg-sky-50 text-sky-700',
    approved: 'bg-emerald-50 text-emerald-700',
    done: 'bg-zinc-100 text-zinc-500',
  }
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${tone[status] || 'bg-zinc-100 text-zinc-700'}`}>
      {label}
    </span>
  )
}

export function DashboardWidgetCard<T extends FilterableRequest>({
  widget,
  items,
  ctx,
  onEdit,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: Props<T>) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => applyWidget(items, widget, ctx), [items, widget, ctx])
  const grouped = useMemo(() => groupBy(filtered, widget.grouping, ctx), [filtered, widget.grouping, ctx])

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className={`col-span-12 ${SIZE_CLASS[widget.size]} rounded-2xl bg-white ring-1 ring-zinc-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/70 px-4 py-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 truncate">{widget.title}</h3>
          <span className="text-[11px] font-medium text-zinc-400 tabular-nums">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move up"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move down"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={onEdit}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
            title="Edit widget"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50"
            title="Remove widget"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[60vh]">
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-zinc-400">
            Nothing here yet.<br /><span className="text-zinc-300">Adjust the filter from the gear above.</span>
          </div>
        )}
        {grouped.map((group) => {
          const collapsed = collapsedGroups.has(group.key)
          return (
            <div key={group.key}>
              {widget.grouping !== 'none' && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full px-4 py-2 flex items-center gap-2 bg-zinc-50 border-y border-zinc-200/60 hover:bg-zinc-100 text-left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-3 w-3 text-zinc-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{group.label}</span>
                  <span className="text-[10.5px] tabular-nums text-zinc-400">{group.items.length}</span>
                </button>
              )}
              {!collapsed && (
                <ul className="divide-y divide-zinc-100">
                  {group.items.map((item) => {
                    const personId = item.designer_id || item.enterprise_contact_id
                    const personName = item.designer_name || item.enterprise_contact_name
                    return (
                      <li key={item.id}>
                        <Link
                          href={widget.source === 'cg-designs' ? `/cg-designs/${item.id}` : `/designs/${item.id}`}
                          className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50 transition-colors"
                        >
                          <span
                            className={`flex-shrink-0 h-7 w-7 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                              personId
                                ? 'bg-gradient-to-br from-[#0A52EF] to-[#6A5CF8] text-white'
                                : 'bg-zinc-100 ring-1 ring-dashed ring-zinc-300 text-zinc-400'
                            }`}
                            title={personName || 'Unassigned'}
                          >
                            {personId ? initials(personName) : '+'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {item.priority === 'high' && (
                                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex-shrink-0" title="High priority">!</span>
                              )}
                              <span className="text-[12.5px] font-medium text-zinc-900 truncate">{item.job_title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusPill status={item.status} />
                              {(item.venue_name || item.company_name) && (
                                <span className="text-[10.5px] text-zinc-500 truncate">
                                  {item.venue_name || item.company_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`flex-shrink-0 text-[10.5px] tabular-nums ${dueTone(item.due_date, ctx.todayIso)}`}>
                            {item.due_date ? new Date(`${item.due_date.slice(0,10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function WidgetBoardEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="col-span-12 rounded-2xl border-2 border-dashed border-zinc-200 px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-zinc-900 mb-1">Your board is empty</h3>
      <p className="text-xs text-zinc-500 mb-4">Add a widget to start composing your view.</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0]"
      >
        + Add widget
      </button>
    </div>
  )
}
