'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { Skeleton } from '@/components/skeleton'

interface StaffOption {
  id: string
  full_name: string
  role: string
  email: string | null
}

interface PreviewEvent {
  id: string
  summary: string
  venue_name: string
  league: string
  start_time: string
  event_date: string
  workflow_status: string
}

const workflowStatusColors: Record<string, { dot: string; label: string; pill: string }> = {
  pending: { dot: 'bg-rose-500', label: 'Pending', pill: 'bg-rose-50 text-rose-700' },
  checked_in: { dot: 'bg-amber-500', label: 'Checked In', pill: 'bg-amber-50 text-amber-700' },
  game_ready: { dot: 'bg-emerald-500', label: 'Game Ready', pill: 'bg-emerald-50 text-emerald-700' },
  post_game_submitted: { dot: 'bg-blue-500', label: 'Complete', pill: 'bg-blue-50 text-blue-700' },
}

export default function PreviewTechPage() {
  const auth = useAuth('manager')
  const router = useRouter()
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [selected, setSelected] = useState<string>('')
  const [events, setEvents] = useState<PreviewEvent[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(false)

  useEffect(() => {
    if (!auth.loaded) return
    if (!auth.isManager) {
      router.replace('/dashboard')
      return
    }
    const load = async () => {
      try {
        const res = await fetch('/api/staff?limit=500')
        if (res.ok) {
          const data = await res.json()
          const list: StaffOption[] = (data.staff || []).map((s: any) => ({
            id: s.id,
            full_name: s.full_name,
            role: s.role,
            email: s.email,
          }))
          list.sort((a, b) => a.full_name.localeCompare(b.full_name))
          setStaff(list)
        }
      } finally {
        setLoadingStaff(false)
      }
    }
    load()
  }, [auth.loaded, auth.isManager, router])

  useEffect(() => {
    if (!selected) {
      setEvents([])
      return
    }
    setLoadingEvents(true)
    fetch(`/api/events?filter=all&limit=250&preview_as=${selected}`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [selected])

  const selectedStaff = useMemo(() => staff.find((s) => s.id === selected) || null, [staff, selected])

  const todayKey = new Date().toISOString().split('T')[0]
  const today = events.filter((e) => e.event_date === todayKey)
  const upcoming = events.filter((e) => e.event_date > todayKey)
  const past = events.filter((e) => e.event_date < todayKey)
  const nextEvent = today[0] || upcoming[0] || null

  const formatTime = (dateTimeStr: string) =>
    new Date(dateTimeStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  const formatDateLabel = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const renderEvent = (event: PreviewEvent) => {
    const status = workflowStatusColors[event.workflow_status] || workflowStatusColors.pending
    return (
      <Link
        key={event.id}
        href={`/workflow/${event.id}`}
        className="block px-5 py-4 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
          <p className="text-sm font-semibold text-zinc-900">{event.summary}</p>
          {event.league && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
              {event.league}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-600 mt-1">{event.venue_name}</p>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2 flex-wrap">
          <span>{formatDateLabel(event.event_date)}</span>
          <span>{formatTime(event.start_time)}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${status.pill}`}>{status.label}</span>
        </div>
      </Link>
    )
  }

  const renderSection = (title: string, items: PreviewEvent[]) => (
    <div className="bg-white rounded-2xl border border-[#E8E8E8] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E8E8] flex items-center justify-between bg-zinc-50/70">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="text-xs text-zinc-500 mt-1">{items.length} assigned event{items.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-zinc-500">No assigned events in this section.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#E8E8E8]">{items.map(renderEvent)}</div>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-[28px] border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-6">
          <p className="text-[11px] uppercase tracking-[0.28em] text-amber-700 font-semibold">Admin Tool</p>
          <h1 className="text-2xl font-semibold text-zinc-900 mt-2">Preview Staff View</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Pick a staff member to see exactly what they see on their dashboard when they log in — their assigned events, next-up card, and workflow access.
          </p>
          <div className="mt-5 max-w-md">
            <label className="block text-xs font-medium text-zinc-700 mb-1">Staff member</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loadingStaff}
              className="w-full border border-[#E8E8E8] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            >
              <option value="">{loadingStaff ? 'Loading staff...' : 'Select a staff member'}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} — {s.role}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedStaff && (
          <div className="rounded-[24px] border border-[#DDE7FF] bg-[linear-gradient(135deg,#0A52EF_0%,#1F7BF2_55%,#7FB5FF_100%)] px-5 py-5 text-white">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/70 font-semibold">Viewing as</p>
            <h2 className="text-xl font-semibold mt-1">{selectedStaff.full_name}</h2>
            <p className="text-sm text-white/80 mt-1">
              {events.length} total assigned event{events.length === 1 ? '' : 's'} — {today.length} today, {upcoming.length} upcoming, {past.length} past
            </p>
          </div>
        )}

        {selectedStaff && nextEvent && (
          <div className="rounded-[24px] border border-[#E8E8E8] bg-white p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#0A52EF] font-semibold">Next Up</p>
            <h2 className="text-lg font-semibold text-zinc-900 mt-2">{nextEvent.summary}</h2>
            <p className="text-sm text-zinc-600 mt-1">{nextEvent.venue_name}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-3">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatDateLabel(nextEvent.event_date)}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatTime(nextEvent.start_time)}</span>
              {(nextEvent.league || '').trim() && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{nextEvent.league}</span>
              )}
            </div>
          </div>
        )}

        {selectedStaff && (
          loadingEvents ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {renderSection('Today', today)}
              {renderSection('Upcoming', upcoming)}
              {renderSection('Past', past)}
            </div>
          )
        )}

        {!selectedStaff && !loadingStaff && (
          <div className="bg-white rounded-2xl border border-[#E8E8E8] px-5 py-10 text-center">
            <p className="text-sm text-zinc-500">Pick a staff member above to preview their dashboard.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
