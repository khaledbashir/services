'use client'

// Venue walk-thru checklists — Joe 2026-08-17.
//
// Two jobs on one page, because they are the same mental task for a manager:
// define the venue's standard walk (screens, systems, custom items), and hand
// that walk to someone for a date. The existing /walkthroughs page is the
// free-text visit log and is untouched — this is the structured checklist.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface VenueOption { id: string; name: string }
interface StaffOption { id: string; full_name: string; is_active?: boolean }

interface TemplateItem {
  id?: string | null
  label: string
  item_type: 'screen' | 'system' | 'custom'
  help_text?: string | null
}

interface WalkthroughRow {
  id: string
  venue_name: string
  assigned_staff_name: string | null
  scheduled_for: string | null
  status: string
  item_count: number
  issue_count: number
  generated_ticket_number: number | null
}

const ITEM_TYPES: Array<TemplateItem['item_type']> = ['screen', 'system', 'custom']

export default function VenueWalkthroughsPage() {
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [venueId, setVenueId] = useState('')
  const [items, setItems] = useState<TemplateItem[]>([])
  const [walkthroughs, setWalkthroughs] = useState<WalkthroughRow[]>([])
  const [assignee, setAssignee] = useState('')
  const [scheduledFor, setScheduledFor] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/venues')
      .then((r) => (r.ok ? r.json() : { venues: [] }))
      .then((d) => setVenues((d.venues || d || []).map((v: any) => ({ id: v.id, name: v.name }))))
      .catch(() => setVenues([]))
    fetch('/api/staff')
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d) => setStaff((d.staff || []).filter((s: StaffOption) => s.is_active !== false)))
      .catch(() => setStaff([]))
  }, [])

  const loadTemplate = useCallback(async (id: string) => {
    if (!id) return
    const res = await fetch(`/api/venue-walkthroughs/template/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setItems(
      (data.items || []).map((i: any) => ({
        id: i.id,
        label: i.label,
        item_type: i.item_type,
        help_text: i.help_text,
      })),
    )
  }, [])

  const loadWalkthroughs = useCallback(async (id: string) => {
    const res = await fetch(id ? `/api/venue-walkthroughs?venue_id=${id}` : '/api/venue-walkthroughs')
    if (!res.ok) return
    const data = await res.json()
    setWalkthroughs(data.walkthroughs || [])
  }, [])

  useEffect(() => {
    loadWalkthroughs(venueId)
    if (venueId) loadTemplate(venueId)
    else setItems([])
  }, [venueId, loadTemplate, loadWalkthroughs])

  const saveTemplate = async () => {
    if (!venueId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/venue-walkthroughs/template/${venueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.filter((i) => i.label.trim()) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data?.error || 'Could not save the checklist')
        return
      }
      setItems((data.items || []).map((i: any) => ({ id: i.id, label: i.label, item_type: i.item_type, help_text: i.help_text })))
      setMessage('Standard walk saved for this venue.')
    } finally {
      setSaving(false)
    }
  }

  const assignWalk = async () => {
    if (!venueId || !assignee) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/venue-walkthroughs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, assigned_staff_id: assignee, scheduled_for: scheduledFor }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data?.error || 'Could not assign the walk-thru')
        return
      }
      setMessage(data?.warning || 'Walk-thru assigned.')
      loadWalkthroughs(venueId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Venue Walk-Thrus</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Define each venue&apos;s standard walk, then assign it. Submitted walks email a summary and open a
            ticket automatically when an issue is found.
          </p>
        </div>

        <div className="rounded-lg border border-[#E8E8E8] bg-white p-4">
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Venue</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="mt-2 h-9 w-full max-w-md rounded-md border border-[#E8E8E8] px-3 text-sm"
          >
            <option value="">Select a venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {message && (
          <div className="rounded-lg border border-[#0A52EF] bg-blue-50 px-4 py-3 text-sm text-[#0A52EF]">{message}</div>
        )}

        {venueId && (
          <>
            <div className="rounded-lg border border-[#E8E8E8] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Standard walk for this venue</h2>
                <button
                  onClick={() => setItems((prev) => [...prev, { label: '', item_type: 'screen' }])}
                  className="h-8 rounded-md border border-[#E8E8E8] px-3 text-xs font-medium text-zinc-600 hover:border-zinc-300"
                >
                  Add item
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Screens, systems and anything custom. Edit this whenever screens are added or removed — it stays the
                standard for every future walk.
              </p>

              <div className="mt-4 space-y-2">
                {items.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-400">No items yet. Add the venue&apos;s screens and systems.</p>
                )}
                {items.map((item, index) => (
                  <div key={item.id || `new-${index}`} className="flex items-center gap-2">
                    <input
                      value={item.label}
                      onChange={(e) =>
                        setItems((prev) => prev.map((i, idx) => (idx === index ? { ...i, label: e.target.value } : i)))
                      }
                      placeholder="e.g. Main Videoboard"
                      className="h-9 flex-1 rounded-md border border-[#E8E8E8] px-3 text-sm"
                    />
                    <select
                      value={item.item_type}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i, idx) => (idx === index ? { ...i, item_type: e.target.value as TemplateItem['item_type'] } : i)),
                        )
                      }
                      className="h-9 rounded-md border border-[#E8E8E8] px-2 text-sm capitalize"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== index))}
                      className="h-9 rounded-md border border-[#E8E8E8] px-3 text-xs text-zinc-500 hover:border-red-300 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={saveTemplate}
                disabled={saving}
                className="mt-4 h-9 rounded-md bg-[#0A52EF] px-4 text-sm font-medium text-white hover:bg-[#0846cc] disabled:opacity-50"
              >
                Save standard walk
              </button>
            </div>

            <div className="rounded-lg border border-[#E8E8E8] bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Assign a walk-thru</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Employee</label>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="mt-1 h-9 w-64 rounded-md border border-[#E8E8E8] px-3 text-sm"
                  >
                    <option value="">Select…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Date</label>
                  <input
                    type="date"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="mt-1 h-9 rounded-md border border-[#E8E8E8] px-3 text-sm"
                  />
                </div>
                <button
                  onClick={assignWalk}
                  disabled={saving || !assignee}
                  className="h-9 rounded-md bg-[#0A52EF] px-4 text-sm font-medium text-white hover:bg-[#0846cc] disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            </div>
          </>
        )}

        <div className="rounded-lg border border-[#E8E8E8] bg-white">
          <div className="border-b border-[#E8E8E8] px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">Walk-thrus</h2>
          </div>
          {walkthroughs.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Nothing assigned yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Venue</th>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {walkthroughs.map((w) => (
                  <tr key={w.id} className="border-b border-[#E8E8E8] hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">{w.scheduled_for || '—'}</td>
                    <td className="px-4 py-3 text-zinc-900">{w.venue_name}</td>
                    <td className="px-4 py-3 text-zinc-600">{w.assigned_staff_name || 'Unassigned'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/venue-walkthroughs/${w.id}`} className="font-medium text-[#0A52EF] hover:underline">
                        {w.status === 'submitted' ? 'View' : 'Open checklist'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {w.status !== 'submitted' ? (
                        <span className="text-zinc-400">{w.item_count} item{w.item_count === 1 ? '' : 's'}</span>
                      ) : w.issue_count > 0 ? (
                        <span className="text-red-600">
                          {w.issue_count} issue{w.issue_count === 1 ? '' : 's'}
                          {w.generated_ticket_number ? ` · ticket #${w.generated_ticket_number}` : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-600">All operating</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
