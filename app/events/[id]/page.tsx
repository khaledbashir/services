'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'

interface EventDetail {
  id: string
  summary: string
  event_date: string
  start_time: string
  end_time: string
  league: string
  workflow_status: string
  venue_id: string
  venue_name: string
  venue_timezone?: string
  requires_staffing: boolean | null
  venue_requires_assignment: boolean
  source: string | null
}

interface Technician {
  id: string
  full_name: string
}

interface WorkflowSubmission {
  id: string
  type: string
  submitted_at: string
  staff_name: string
  submission_data: any
}

interface RecentEvent {
  id: string
  summary: string
  event_date: string
  workflow_status: string
}

interface Ticket {
  id: string
  title: string
  status: string
  priority: string
}

export default function EventDetailPage() {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id as string

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [workflows, setWorkflows] = useState<WorkflowSubmission[]>([])
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [openTickets, setOpenTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [allStaff, setAllStaff] = useState<Array<{ id: string; full_name: string; role: string; week_hours: number; week_events: number; linked_to_venue: boolean }>>([])
  const [assigning, setAssigning] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (auth.loaded && auth.role === 'technician' && eventId) {
      router.replace(`/workflow/${eventId}`)
      return
    }
  }, [auth.loaded, auth.role, eventId, router])

  useEffect(() => {
    if (!eventId) return
    if (auth.loaded && auth.role === 'technician') return

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`)
        if (!res.ok) throw new Error('Failed to fetch')

        const data = await res.json()
        setEvent(data.event)
        setTechnicians(data.technicians || [])
        setWorkflows(data.workflows || [])
        setRecentEvents(data.recentEvents || [])
        setOpenTickets(data.openTickets || [])
      } catch (err) {
        console.error('Error fetching event:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [auth.loaded, auth.role, eventId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (timeStr: string, timeZone?: string) => {
    const date = new Date(timeStr)
    const tz = timeZone || 'America/New_York'
    const label = tz === 'America/New_York' ? 'ET' : tz === 'America/Los_Angeles' ? 'PT' : tz === 'America/Chicago' ? 'CT' : tz === 'America/Denver' ? 'MT' : 'local'
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz }) + ' ' + label
  }

  const getCountdown = (eventDate: string, startTime: string) => {
    const eventDateTime = new Date(startTime || eventDate)
    const now = new Date()
    const diffMs = eventDateTime.getTime() - now.getTime()

    if (isNaN(diffMs)) return { text: '', color: 'text-zinc-400' }
    if (diffMs < 0) return { text: 'Completed', color: 'text-blue-600' }
    if (diffMs < 7200000) return { text: 'Starting Soon', color: 'text-amber-600' }

    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    return { text: `Starts in ${hours}h ${mins}m`, color: 'text-zinc-500' }
  }

  const getWorkflowSteps = () => {
    return [
      { order: 1, name: 'Check-in', type: 'check_in' },
      { order: 2, name: 'Game Ready', type: 'game_ready' },
      { order: 3, name: 'Post-Game', type: 'post_game_report' },
    ]
  }

  const getStepStatus = (stepType: string) => {
    const submission = workflows.find((w) => w.type === stepType)
    return submission ? 'completed' : 'pending'
  }

  const getStepData = (stepType: string) => {
    return workflows.find((w) => w.type === stepType)
  }

  const startEditing = (field: string, currentValue: string) => {
    setEditing(field)
    setEditValues({ ...editValues, [field]: currentValue })
  }

  const cancelEditing = () => {
    setEditing(null)
  }

  const saveField = async (field: string) => {
    if (!event || saving) return
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      if (field === 'summary') {
        payload.summary = editValues.summary
      } else if (field === 'event_date') {
        payload.event_date = editValues.event_date
      } else if (field === 'start_time') {
        payload.start_time = editValues.start_time
        payload.event_date = event.event_date
      } else if (field === 'end_time') {
        payload.end_time = editValues.end_time
        payload.event_date = event.event_date
      }

      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        // Re-fetch event to get updated timestamps
        const refetch = await fetch(`/api/events/${eventId}`)
        if (refetch.ok) {
          const data = await refetch.json()
          setEvent(data.event)
        }
      }
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
      setEditing(null)
    }
  }

  const extractTime = (timestamp: string) => {
    try {
      const d = new Date(timestamp)
      const h = d.getUTCHours().toString().padStart(2, '0')
      const m = d.getUTCMinutes().toString().padStart(2, '0')
      return `${h}:${m}`
    } catch {
      return '00:00'
    }
  }

  const isManager = auth.role === 'admin' || auth.role === 'manager'

  if (!auth.loaded || loading || !event) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-zinc-200 w-32 rounded"></div>
          <div className="h-64 bg-zinc-100 rounded"></div>
        </div>
      </DashboardLayout>
    )
  }

  const countdown = getCountdown(event.event_date, event.start_time)
  const workflowSteps = getWorkflowSteps()

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <Link href="/events" className="text-sm text-[#0A52EF] hover:text-[#0840C0] font-medium mb-4 block">
            ← Back to Events
          </Link>
          {editing === 'summary' ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValues.summary}
                onChange={(e) => setEditValues({ ...editValues, summary: e.target.value })}
                className="text-xl font-semibold text-zinc-900 border border-[#0A52EF] rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveField('summary'); if (e.key === 'Escape') cancelEditing() }}
              />
              <button onClick={() => saveField('summary')} disabled={saving} className="text-xs px-2.5 py-1.5 bg-[#0A52EF] text-white rounded font-medium hover:bg-[#0840C0] disabled:opacity-50">Save</button>
              <button onClick={cancelEditing} className="text-xs px-2.5 py-1.5 text-zinc-500 hover:text-zinc-700">Cancel</button>
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-zinc-900 group">
              {event.summary}
              {isManager && (
                <button onClick={() => startEditing('summary', event.summary)} className="ml-2 text-zinc-300 hover:text-[#0A52EF] opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </h1>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Link href={`/venues/${event.venue_id}`} className="text-sm text-[#0A52EF] hover:underline font-medium">{event.venue_name}</Link>
            <span className="inline-block px-2.5 py-1 rounded text-xs font-medium bg-orange-50 text-orange-600">{event.league}</span>
            {event.source && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-violet-50 text-violet-600" title={event.source}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {event.source.startsWith('http') ? (
                  <a href={event.source} target="_blank" rel="noopener noreferrer" className="hover:underline">{new URL(event.source).hostname.replace('www.', '')}</a>
                ) : (
                  event.source
                )}
              </span>
            )}
          </div>
          <p className={`text-sm font-medium mt-2 ${countdown.color}`}>{countdown.text}</p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Info Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#FAFAFA] rounded p-4 group">
                <p className="text-xs text-zinc-500 font-medium mb-1">Date</p>
                {editing === 'event_date' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={editValues.event_date}
                      onChange={(e) => setEditValues({ ...editValues, event_date: e.target.value })}
                      className="text-sm font-semibold text-zinc-900 border border-[#0A52EF] rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveField('event_date'); if (e.key === 'Escape') cancelEditing() }}
                    />
                    <button onClick={() => saveField('event_date')} disabled={saving} className="text-[10px] px-1.5 py-1 bg-[#0A52EF] text-white rounded font-medium">OK</button>
                    <button onClick={cancelEditing} className="text-[10px] text-zinc-400">X</button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatDate(event.event_date)}
                    {isManager && (
                      <button onClick={() => startEditing('event_date', event.event_date)} className="ml-1.5 text-zinc-300 hover:text-[#0A52EF] opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                  </p>
                )}
              </div>
              <div className="bg-[#FAFAFA] rounded p-4 group">
                <p className="text-xs text-zinc-500 font-medium mb-1">Start Time</p>
                {editing === 'start_time' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={editValues.start_time}
                      onChange={(e) => setEditValues({ ...editValues, start_time: e.target.value })}
                      className="text-sm font-semibold text-zinc-900 border border-[#0A52EF] rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveField('start_time'); if (e.key === 'Escape') cancelEditing() }}
                    />
                    <button onClick={() => saveField('start_time')} disabled={saving} className="text-[10px] px-1.5 py-1 bg-[#0A52EF] text-white rounded font-medium">OK</button>
                    <button onClick={cancelEditing} className="text-[10px] text-zinc-400">X</button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatTime(event.start_time, event.venue_timezone)}
                    {isManager && (
                      <button onClick={() => startEditing('start_time', extractTime(event.start_time))} className="ml-1.5 text-zinc-300 hover:text-[#0A52EF] opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                  </p>
                )}
              </div>
              <div className="bg-[#FAFAFA] rounded p-4 group">
                <p className="text-xs text-zinc-500 font-medium mb-1">End Time</p>
                {editing === 'end_time' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={editValues.end_time}
                      onChange={(e) => setEditValues({ ...editValues, end_time: e.target.value })}
                      className="text-sm font-semibold text-zinc-900 border border-[#0A52EF] rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveField('end_time'); if (e.key === 'Escape') cancelEditing() }}
                    />
                    <button onClick={() => saveField('end_time')} disabled={saving} className="text-[10px] px-1.5 py-1 bg-[#0A52EF] text-white rounded font-medium">OK</button>
                    <button onClick={cancelEditing} className="text-[10px] text-zinc-400">X</button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatTime(event.end_time, event.venue_timezone)}
                    {isManager && (
                      <button onClick={() => startEditing('end_time', extractTime(event.end_time))} className="ml-1.5 text-zinc-300 hover:text-[#0A52EF] opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Workflow Progress Stepper */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-6">Workflow Progress</h2>
              <div className="space-y-6">
                {workflowSteps.map((step, idx) => {
                  const status = getStepStatus(step.type)
                  const stepData = getStepData(step.type)
                  const isCompleted = status === 'completed'
                  const isLast = idx === workflowSteps.length - 1

                  return (
                    <div key={step.type}>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white text-sm ${
                              isCompleted ? 'bg-emerald-500' : 'bg-[#0A52EF]'
                            }`}
                          >
                            {isCompleted ? '✓' : step.order}
                          </div>
                          {!isLast && (
                            <div
                              className={`w-0.5 h-12 mt-2 ${
                                isCompleted ? 'bg-emerald-500' : 'bg-zinc-200 border-l border-dashed border-zinc-300'
                              }`}
                            ></div>
                          )}
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="font-medium text-zinc-900">{step.name}</p>
                          {stepData && (
                            <div className="mt-2 text-xs text-zinc-600 space-y-1">
                              <p>Submitted: {new Date(stepData.submitted_at).toLocaleString()}</p>
                              <p>By: {stepData.staff_name}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Post-Game Report */}
            {workflows.some((w) => w.type === 'post_game_report') && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Post-Game Report</h2>
                {workflows
                  .filter((w) => w.type === 'post_game_report')
                  .map((w) => (
                    <div key={w.id} className="space-y-4 text-sm">
                      {w.submission_data?.rotational_report && (
                        <div>
                          <p className="font-medium text-zinc-900 mb-1">Rotational Report</p>
                          <p className="text-zinc-600">{w.submission_data.rotational_report}</p>
                        </div>
                      )}
                      {w.submission_data?.operations_report && (
                        <div>
                          <p className="font-medium text-zinc-900 mb-1">Operations Report</p>
                          <p className="text-zinc-600">{w.submission_data.operations_report}</p>
                        </div>
                      )}
                      {w.submission_data && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="font-medium text-zinc-900 mb-1">Extra Timesheets</p>
                            <p className="text-zinc-600">{w.submission_data.extra_timesheets ? 'Yes' : 'No'}</p>
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900 mb-1">Auditor</p>
                            <p className="text-zinc-600">{w.submission_data.auditor || 'N/A'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Event Activity Timeline */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-6">Activity Timeline</h2>
              <div className="space-y-4">
                {workflows.length === 0 ? (
                  <p className="text-sm text-zinc-500">No activity yet</p>
                ) : (
                  workflows.map((w, idx) => (
                    <div key={w.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full ${w.type === 'check_in' ? 'bg-amber-500' : w.type === 'game_ready' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                        {idx < workflows.length - 1 && <div className="w-0.5 h-8 bg-zinc-200 mt-2"></div>}
                      </div>
                      <div className="pb-4 pt-1">
                        <p className="text-sm font-medium text-zinc-900">
                          {w.staff_name}{' '}
                          <span className="text-zinc-600">
                            {w.type === 'check_in' && 'checked in'}
                            {w.type === 'game_ready' && 'confirmed game ready'}
                            {w.type === 'post_game_report' && 'submitted post-game report'}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">{new Date(w.submitted_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Assigned Technicians */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assigned Technicians</h2>
              {technicians.length === 0 ? (
                <p className="text-xs text-zinc-500 mb-4">No technicians assigned</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {technicians.map((tech) => (
                    <div key={tech.id} className="flex items-center gap-2 text-xs">
                      {(() => {
                        const techName = tech.full_name || 'Unknown Tech'
                        return (
                          <>
                      <div className="w-6 h-6 rounded-full bg-[#0A52EF]/15 flex items-center justify-center text-[10px] font-semibold text-[#0A52EF]">
                        {techName.charAt(0)}
                      </div>
                      <Link href={`/staff/${tech.id}`} className="text-[#0A52EF] hover:underline flex-1">{techName}</Link>
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/events/${eventId}/assign`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ staffId: tech.id }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            setTechnicians(data.assignedTechs || [])
                          }
                        }}
                        className="text-zinc-400 hover:text-rose-500 transition-colors"
                      >×</button>
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Technician */}
              {showAssignDropdown ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#E8E8E8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto border border-[#E8E8E8] rounded divide-y divide-[#E8E8E8]">
                    {allStaff
                      .filter(s => !technicians.some(t => t.id === s.id))
                      .filter(s => !staffSearch || s.full_name.toLowerCase().includes(staffSearch.toLowerCase()))
                      .map(s => (
                        <button
                          key={s.id}
                          disabled={assigning}
                          onClick={async () => {
                            setAssigning(true)
                            const res = await fetch(`/api/events/${eventId}/assign`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ staffId: s.id }),
                            })
                            if (res.ok) {
                              const data = await res.json()
                              setTechnicians(data.assignedTechs || [])
                            }
                            setAssigning(false)
                            setStaffSearch('')
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-zinc-900">{s.full_name}</p>
                              {s.linked_to_venue && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">venue</span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500">{s.role}</p>
                          </div>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${Number(s.week_hours) > 40 ? 'bg-rose-50 text-rose-600' : Number(s.week_hours) > 30 ? 'bg-amber-50 text-amber-600' : 'bg-zinc-100 text-zinc-500'}`}>
                            {Number(s.week_hours)}h this week
                          </span>
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => { setShowAssignDropdown(false); setStaffSearch('') }}
                    className="w-full text-xs px-3 py-1.5 text-zinc-500 hover:text-zinc-700"
                  >Cancel</button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setShowAssignDropdown(true)
                    if (allStaff.length === 0) {
                      const res = await fetch(`/api/staff/available${event?.venue_id ? `?venue_id=${event.venue_id}` : ''}`)
                      if (res.ok) {
                        const data = await res.json()
                        setAllStaff(data.staff || [])
                      }
                    }
                  }}
                  className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded hover:bg-zinc-50 text-zinc-700 font-medium"
                >
                  + Add Technician
                </button>
              )}
            </div>

            {/* Staffing Requirement */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-2">Staffing Requirement</h2>
              <p className="text-xs text-zinc-500 mb-3">
                Venue default: <span className="font-medium text-zinc-700">{event.venue_requires_assignment ? 'Requires staffing' : 'Warranty only'}</span>
              </p>
              {(() => {
                const effective = event.requires_staffing !== null && event.requires_staffing !== undefined
                  ? event.requires_staffing
                  : event.venue_requires_assignment
                const isOverridden = event.requires_staffing !== null && event.requires_staffing !== undefined
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          const newVal = !effective
                          const res = await fetch(`/api/events/${eventId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ requires_staffing: newVal }),
                          })
                          if (res.ok) {
                            setEvent(prev => prev ? { ...prev, requires_staffing: newVal } : prev)
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${effective ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${effective ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <span className="text-sm text-zinc-700">{effective ? 'Requires staffing' : 'Warranty only'}</span>
                    </div>
                    {isOverridden && (
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/events/${eventId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ requires_staffing: null }),
                          })
                          if (res.ok) {
                            setEvent(prev => prev ? { ...prev, requires_staffing: null } : prev)
                          }
                        }}
                        className="text-xs text-[#0A52EF] hover:underline font-medium"
                      >
                        Reset to venue default
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3">Quick Actions</h2>
              <button
                onClick={() => router.push(`/tickets?venue=${event.venue_id}`)}
                className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded hover:bg-zinc-50 text-zinc-700 font-medium"
              >
                Create Ticket for This Event
              </button>
              <button className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded hover:bg-zinc-50 text-zinc-700 font-medium">
                Send Reminder
              </button>
            </div>

            {/* Tickets for This Event */}
            {openTickets.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-zinc-900">Tickets ({openTickets.length})</h2>
                  <Link href={`/tickets?venue=${event.venue_id}`} className="text-[10px] text-[#0A52EF] hover:underline font-medium">View All</Link>
                </div>
                <div className="space-y-2">
                  {openTickets.map((t) => {
                    const priColor = t.priority === 'critical' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-zinc-400'
                    return (
                      <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center gap-2 text-xs hover:bg-zinc-50 p-2 rounded transition-colors">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priColor}`} />
                        <span className="text-zinc-900 font-medium truncate flex-1">{t.title}</span>
                        <span className="text-zinc-400 capitalize text-[10px]">{t.status.replace('_', ' ')}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent Events */}
            {recentEvents.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-zinc-900 mb-3">Recent Events at This Venue</h2>
                <div className="space-y-2">
                  {recentEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => router.push(`/events/${evt.id}`)}
                      className="text-xs cursor-pointer hover:bg-zinc-50 p-2 rounded transition-colors"
                    >
                      <p className="font-medium text-zinc-900">{evt.summary}</p>
                      <p className="text-zinc-500">{formatDate(evt.event_date)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
