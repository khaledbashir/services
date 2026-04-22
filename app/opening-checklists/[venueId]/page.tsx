'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { formatDate } from '@/lib/format-date'
import { useAuth } from '@/lib/useAuth'

interface StaffOption {
  id: string
  full_name: string
}

interface ChecklistItem {
  id: string
  venue_id: string | null
  venue_name: string | null
  name: string
  league: string | null
  phase: string
  opening_date: string | null
  due_date: string | null
  item_description: string | null
  checklist_assignee_id: string | null
  checklist_assignee_name: string | null
  status: string
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface VenueRecord {
  id: string
  name: string
}

const PHASES = [
  { key: '90_day', label: '90 Day' },
  { key: '60_day', label: '60 Day' },
  { key: '30_day', label: '30 Day' },
  { key: 'opening_week', label: 'Opening Week' },
  { key: 'opening_day', label: 'Opening Day' },
] as const

const STATUS_OPTIONS = ['pending', 'in_progress', 'blocked', 'complete', 'skipped'] as const

const EMPTY_FORM = {
  name: '',
  league: 'MLB',
  phase: '30_day',
  opening_date: '',
  due_date: '',
  item_description: '',
  checklist_assignee_id: '',
  status: 'pending',
  notes: '',
}

export default function OpeningChecklistVenuePage() {
  const auth = useAuth()
  const params = useParams<{ venueId: string }>()
  const venueId = String(params?.venueId || '')
  const { showToast } = useToast()

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [venue, setVenue] = useState<VenueRecord | null>(null)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('in_progress')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [itemsRes, venuesRes, staffRes] = await Promise.all([
        fetch(`/api/opening-checklists?venue_id=${venueId}`),
        fetch('/api/venues'),
        fetch('/api/staff'),
      ])
      const [itemsJson, venuesJson, staffJson] = await Promise.all([
        itemsRes.json(),
        venuesRes.json(),
        staffRes.json(),
      ])
      setItems(itemsJson.items || [])
      setVenue(((venuesJson.venues || []) as VenueRecord[]).find((entry) => entry.id === venueId) || null)
      setStaff((staffJson.staff || []).map((entry: any) => ({ id: entry.id, full_name: entry.full_name })))
    } catch (err) {
      console.error(err)
      showToast('Failed to load stadium prep detail', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (venueId) fetchData()
  }, [venueId])

  const grouped = useMemo(() => {
    return PHASES.map((phase) => ({
      ...phase,
      items: items.filter((item) => item.phase === phase.key),
    }))
  }, [items])

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulkStatus() {
    if (selectedIds.size === 0 || bulkUpdating) return
    setBulkUpdating(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/opening-checklists/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: bulkStatus }),
          }),
        ),
      )
      setSelectedIds(new Set())
      showToast('Bulk status update complete', 'success')
      await fetchData()
    } catch (err) {
      console.error(err)
      showToast('Failed to update selected items', 'error')
    } finally {
      setBulkUpdating(false)
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      showToast('Task title is required', 'error')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/opening-checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          name: form.name.trim(),
          league: form.league,
          phase: form.phase,
          opening_date: form.opening_date || null,
          due_date: form.due_date || null,
          item_description: form.item_description || null,
          checklist_assignee_id: form.checklist_assignee_id || null,
          status: form.status,
          notes: form.notes || null,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(json.error || 'Failed to create checklist item', 'error')
        return
      }

      setForm(EMPTY_FORM)
      setShowCreate(false)
      showToast('Checklist item created', 'success')
      await fetchData()
    } catch (err) {
      console.error(err)
      showToast('Failed to create checklist item', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !auth.loaded) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-80 rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#D9E4FF] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF4FF] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/opening-checklists" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF] hover:underline">
                Stadium Prep
              </Link>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{venue?.name || 'Venue Detail'}</h1>
              <p className="mt-1 text-sm text-zinc-500">{items.length} live opening checklist items for this venue.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowCreate((current) => !current)}
                className="rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0840C0]"
              >
                {showCreate ? 'Cancel' : 'New Item'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E6ECF5] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-zinc-600">
              {selectedIds.size === 0 ? 'Select checklist items to run a bulk status update.' : `${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} selected`}
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value)}
                className="rounded-xl border border-[#E6ECF5] bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status.replace('_', ' ')}</option>
                ))}
              </select>
              <button
                onClick={runBulkStatus}
                disabled={selectedIds.size === 0 || bulkUpdating}
                className="rounded-xl border border-[#D9E4FF] px-4 py-2.5 text-sm font-medium text-[#0A52EF] transition hover:bg-[#F5F9FF] disabled:opacity-50"
              >
                {bulkUpdating ? 'Updating...' : 'Apply Bulk Status'}
              </button>
            </div>
          </div>
        </section>

        {showCreate && (
          <section className="rounded-2xl border border-[#E6ECF5] bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Create Opening Checklist Item</h2>
            <form onSubmit={submitCreate} className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Task Title</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">League</label>
                <select value={form.league} onChange={(event) => setForm((current) => ({ ...current, league: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10">
                  {['MLB', 'NBA', 'NHL', 'NFL', 'NCAA', 'OTHER'].map((league) => (
                    <option key={league} value={league}>{league === 'OTHER' ? 'Other' : league}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Phase</label>
                <select value={form.phase} onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10">
                  {PHASES.map((phase) => (
                    <option key={phase.key} value={phase.key}>{phase.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Opening Date</label>
                <input type="date" value={form.opening_date} onChange={(event) => setForm((current) => ({ ...current, opening_date: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Due Date Override</label>
                <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Assignee</label>
                <select value={form.checklist_assignee_id} onChange={(event) => setForm((current) => ({ ...current, checklist_assignee_id: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10">
                  <option value="">Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>{member.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</label>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10">
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Description</label>
                <textarea value={form.item_description} onChange={(event) => setForm((current) => ({ ...current, item_description: event.target.value }))} rows={4} className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10" />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Notes</label>
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10" />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button type="submit" disabled={submitting} className="rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0840C0] disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Checklist Item'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="space-y-4">
          {grouped.map((group) => (
            <div key={group.key} className="rounded-2xl border border-[#E6ECF5] bg-white shadow-sm">
              <div className="border-b border-[#EEF2F7] px-5 py-4">
                <h2 className="text-base font-semibold text-zinc-950">{group.label}</h2>
                <p className="mt-1 text-sm text-zinc-500">{group.items.length} item{group.items.length === 1 ? '' : 's'}</p>
              </div>
              <div className="divide-y divide-[#F0F3F8]">
                {group.items.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-zinc-500">No items in this phase yet.</div>
                ) : (
                  group.items.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-start gap-4 px-5 py-4 transition hover:bg-[#FAFCFF]">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-zinc-950">{item.name}</div>
                          <span className="rounded-full border border-[#E6ECF5] bg-[#FBFDFF] px-2.5 py-1 text-xs font-medium text-zinc-600">
                            {item.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-600">{item.item_description || 'No description yet.'}</p>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                          <span>Assignee: {item.checklist_assignee_name || 'Unassigned'}</span>
                          <span>Due: {formatDate(item.due_date)}</span>
                          <span>Opening: {formatDate(item.opening_date)}</span>
                          {item.completed_at && <span>Completed: {formatDate(item.completed_at)}</span>}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </DashboardLayout>
  )
}
