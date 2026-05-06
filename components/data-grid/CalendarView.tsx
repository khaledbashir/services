'use client'

// CalendarView — month-grid calendar for date-bearing tables. Renders
// records as colored chips on their date cell; click a chip to open the
// record drawer. Pairs with <DataGrid>: when an active view has type
// 'calendar', DataGrid swaps its grid body for this component while the
// view tabs and toolbar stay in place.
//
// Compact 3-chip-per-cell render with a "+N more" overflow that pops a
// per-day list. Month nav at the top. Today is highlighted.

import { useMemo, useState } from 'react'
import type { ColumnConfig } from './types'
import { pillClass } from './types'

interface CalendarProps<TRow extends { id: string }> {
  rows: TRow[]
  columns: ColumnConfig<TRow>[]
  dateField: string
  onOpenRecord?: (row: TRow) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
function isoDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10) }
function asDateOnly(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10) || null
  try { return new Date(value).toISOString().slice(0, 10) } catch { return null }
}

export function CalendarView<TRow extends { id: string }>({
  rows, columns, dateField, onOpenRecord,
}: CalendarProps<TRow>) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [dayPopover, setDayPopover] = useState<string | null>(null)

  const primary = columns.find(c => c.primary) || columns[0]
  const statusCol = columns.find(c => c.type === 'singleSelect')

  // Bucket rows by ISO date so cell render is O(1) per cell.
  const byDay = useMemo(() => {
    const m = new Map<string, TRow[]>()
    for (const r of rows) {
      const key = asDateOnly((r as any)[dateField])
      if (!key) continue
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return m
  }, [rows, dateField])

  // Build the 6-row month grid (always 42 cells so the layout is stable).
  const grid = useMemo(() => {
    const first = startOfMonth(cursor)
    const offset = first.getDay() // Sun=0
    const dim = daysInMonth(cursor)
    const cells: { date: Date; inMonth: boolean }[] = []
    // Leading days from previous month
    for (let i = offset; i > 0; i--) {
      const d = new Date(first); d.setDate(d.getDate() - i)
      cells.push({ date: d, inMonth: false })
    }
    // Current month
    for (let i = 0; i < dim; i++) {
      const d = new Date(first); d.setDate(d.getDate() + i)
      cells.push({ date: d, inMonth: true })
    }
    // Trailing to fill 42
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date
      const d = new Date(last); d.setDate(d.getDate() + 1)
      cells.push({ date: d, inMonth: false })
    }
    return cells
  }, [cursor])

  const todayKey = isoDay(new Date())
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const chip = (row: TRow) => {
    const label = (row as any)[primary.id] || (row as any).id
    const statusVal = statusCol ? (row as any)[statusCol.id] : null
    const statusOpt = statusCol?.options?.find(o => o.value === statusVal)
    return (
      <button
        key={row.id}
        onClick={(e) => { e.stopPropagation(); onOpenRecord?.(row) }}
        className={
          'w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded border ' +
          (statusOpt ? pillClass(statusOpt.color) : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100')
        }
        title={String(label)}
      >
        {String(label)}
      </button>
    )
  }

  const popoverDay = dayPopover ? byDay.get(dayPopover) || [] : []

  return (
    <div className="relative">
      {/* Calendar toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(c => addMonths(c, -1))}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            aria-label="Previous month"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="px-2.5 h-7 text-[11px] font-medium rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(c => addMonths(c, 1))}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            aria-label="Next month"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <div className="text-sm font-semibold text-zinc-800">{monthLabel}</div>
        <div className="text-[11px] text-zinc-500 tabular-nums">{rows.length} {rows.length === 1 ? 'record' : 'records'}</div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 bg-zinc-50/60 border-b border-zinc-200 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
        {WEEKDAYS.map(w => (
          <div key={w} className="px-2 py-1.5 text-center">{w}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {grid.map((cell, i) => {
          const k = isoDay(cell.date)
          const records = byDay.get(k) || []
          const isToday = k === todayKey
          const visible = records.slice(0, 3)
          const hidden = records.length - visible.length
          return (
            <div
              key={i}
              className={
                'border-r border-b border-zinc-100 px-1.5 py-1 flex flex-col gap-0.5 overflow-hidden ' +
                (cell.inMonth ? 'bg-white' : 'bg-zinc-50/40')
              }
            >
              <div className="flex items-center justify-between">
                <span className={
                  'text-[11px] tabular-nums ' +
                  (isToday
                    ? 'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-[#0A52EF] text-white font-medium'
                    : cell.inMonth ? 'text-zinc-700' : 'text-zinc-400')
                }>
                  {cell.date.getDate()}
                </span>
              </div>
              {visible.map(chip)}
              {hidden > 0 && (
                <button
                  onClick={() => setDayPopover(k)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-800 self-start"
                >
                  +{hidden} more
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Day popover — full list of records on a chosen day */}
      {dayPopover && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setDayPopover(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-900">
                {new Date(dayPopover + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button onClick={() => setDayPopover(null)} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {popoverDay.map(r => (
                <div key={r.id}>{chip(r)}</div>
              ))}
              {popoverDay.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-zinc-400">No records this day</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
