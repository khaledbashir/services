'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface TimeEntry {
  id: string
  budget_id: string | null
  designer_id: string | null
  designer_name: string | null
  design_request_id: string | null
  entry_date: string
  hours: number
  description: string | null
  created_at: string
  budget_client_name: string | null
  venue_name: string | null
}

interface Staff { id: string; full_name: string }

function currentMondayStart() {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [designerId, setDesignerId] = useState('')
  const [fromDate, setFromDate] = useState(() => currentMondayStart())
  const [toDate, setToDate] = useState(() => addDays(currentMondayStart(), 6))
  const [saving, setSaving] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    designer_id: '',
    hours: '',
    description: '',
  })

  const fetchData = async () => {
    try {
      const params = new URLSearchParams()
      if (designerId) params.set('designer_id', designerId)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const [entriesRes, staffRes] = await Promise.all([
        fetch(`/api/time-entries${params.toString() ? `?${params.toString()}` : ''}`).then((r) => r.json()),
        fetch('/api/staff').then((r) => r.json()),
      ])
      setEntries(entriesRes.time_entries || [])
      setStaff(staffRes.staff || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designerId, fromDate, toDate])

  useEffect(() => {
    try {
      const currentUserId = localStorage.getItem('userId') || ''
      if (currentUserId) setDraft((prev) => ({ ...prev, designer_id: prev.designer_id || currentUserId }))
    } catch {}
  }, [])

  const saveEntry = async () => {
    const hours = Number(draft.hours)
    if (!Number.isFinite(hours) || hours <= 0) {
      setEntryError('Enter hours greater than 0.')
      return
    }
    setSaving(true)
    setEntryError(null)
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_date: draft.entry_date,
          designer_id: draft.designer_id || null,
          hours,
          description: draft.description.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Could not save time entry (${res.status})`)
      }
      setDraft((prev) => ({ ...prev, hours: '', description: '' }))
      await fetchData()
    } catch (err) {
      console.error(err)
      setEntryError(err instanceof Error ? err.message : 'Could not save time entry')
    } finally {
      setSaving(false)
    }
  }

  const totals = useMemo(() => {
    const hours = entries.reduce((sum, item) => sum + Number(item.hours || 0), 0)
    return { hours, count: entries.length }
  }, [entries])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Time Entries</h1>
            <p className="mt-1 text-sm text-zinc-500">{totals.count} entries · {totals.hours.toFixed(2)} hours · week starts Monday</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const monday = currentMondayStart()
              setFromDate(monday)
              setToDate(addDays(monday, 6))
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
          >
            Current week
          </button>
        </div>

        <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Designer</label>
            <select
              value={designerId}
              onChange={(e) => setDesignerId(e.target.value)}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            >
              <option value="">All designers</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {entryError && (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{entryError}</div>
          )}
          <div className="grid gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm md:grid-cols-[0.9fr,1.1fr,0.55fr,1.8fr,auto]">
            <input
              type="date"
              value={draft.entry_date}
              onChange={(e) => setDraft((prev) => ({ ...prev, entry_date: e.target.value }))}
              className="min-w-0 border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <select
              value={draft.designer_id}
              onChange={(e) => setDraft((prev) => ({ ...prev, designer_id: e.target.value }))}
              className="min-w-0 border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            >
              <option value="">Designer...</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.25"
              placeholder="Hours"
              value={draft.hours}
              onChange={(e) => setDraft((prev) => ({ ...prev, hours: e.target.value }))}
              className="min-w-0 border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <input
              type="text"
              placeholder="Description"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEntry()
              }}
              className="min-w-0 border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <button
              type="button"
              onClick={saveEntry}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
          <div className="grid grid-cols-[0.85fr,1.2fr,1fr,0.6fr,1.8fr] gap-4 border-b border-zinc-200 bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <div>Date</div>
            <div>Budget / Client</div>
            <div>Designer</div>
            <div>Hours</div>
            <div>Description</div>
          </div>
          <div className="divide-y divide-zinc-200">
            {entries.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-zinc-400">No entries match the current filters</div>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[0.85fr,1.2fr,1fr,0.6fr,1.8fr] gap-4 px-4 py-4 text-sm">
                <div className="text-zinc-600">{entry.entry_date ? new Date(`${entry.entry_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}</div>
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{entry.budget_client_name || 'No budget linked'}</p>
                  <p className="mt-1 text-xs text-zinc-400">{entry.venue_name || 'No venue'}</p>
                  {entry.budget_id && (
                    <Link href={`/hours-budgets/${entry.budget_id}`} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:text-blue-800">
                      View budget
                    </Link>
                  )}
                </div>
                <div className="text-zinc-700">{entry.designer_name || 'Unassigned'}</div>
                <div className="font-medium text-zinc-900">{Number(entry.hours).toFixed(2)}</div>
                <div className="text-zinc-600">{entry.description || 'No description'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
