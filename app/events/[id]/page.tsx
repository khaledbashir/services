'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import Link from 'next/link'

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
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id as string

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [workflows, setWorkflows] = useState<WorkflowSubmission[]>([])
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [openTickets, setOpenTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [allStaff, setAllStaff] = useState<Array<{ id: string; full_name: string; role: string; week_hours: number; week_events: number }>>([])
  const [assigning, setAssigning] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')

  useEffect(() => {
    if (!eventId) return

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
  }, [eventId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET'
  }

  const getCountdown = (eventDate: string, startTime: string) => {
    const eventDateTime = new Date(`${eventDate}T${startTime}`)
    const now = new Date()
    const diffMs = eventDateTime.getTime() - now.getTime()

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

  const copyWorkflowLink = async () => {
    const link = `${window.location.origin}/workflow/${eventId}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !event) {
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
          <h1 className="text-xl font-semibold text-zinc-900">{event.summary}</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm text-zinc-600">{event.venue_name}</p>
            <span className="inline-block px-2.5 py-1 rounded text-xs font-medium bg-orange-50 text-orange-600">{event.league}</span>
          </div>
          <p className={`text-sm font-medium mt-2 ${countdown.color}`}>{countdown.text}</p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Info Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#FAFAFA] rounded p-4">
                <p className="text-xs text-zinc-500 font-medium mb-1">Date</p>
                <p className="text-sm font-semibold text-zinc-900">{formatDate(event.event_date)}</p>
              </div>
              <div className="bg-[#FAFAFA] rounded p-4">
                <p className="text-xs text-zinc-500 font-medium mb-1">Start Time</p>
                <p className="text-sm font-semibold text-zinc-900">{formatTime(event.start_time)}</p>
              </div>
              <div className="bg-[#FAFAFA] rounded p-4">
                <p className="text-xs text-zinc-500 font-medium mb-1">End Time</p>
                <p className="text-sm font-semibold text-zinc-900">{formatTime(event.end_time)}</p>
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
                      <div className="w-6 h-6 rounded-full bg-[#0A52EF]/15 flex items-center justify-center text-[10px] font-semibold text-[#0A52EF]">
                        {tech.full_name.charAt(0)}
                      </div>
                      <span className="text-zinc-700 flex-1">{tech.full_name}</span>
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
                            <p className="text-xs font-medium text-zinc-900">{s.full_name}</p>
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
                      const res = await fetch('/api/staff/available')
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

            {/* Workflow Link */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3">Workflow Link</h2>
              <div className="bg-[#FAFAFA] font-mono text-xs rounded p-3 mb-3 overflow-hidden text-ellipsis whitespace-nowrap">
                {window.location.origin}/workflow/{eventId}
              </div>
              <button
                onClick={copyWorkflowLink}
                className="w-full text-xs px-3 py-2 bg-[#0A52EF] text-white rounded hover:bg-[#0840C0] font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <p className="text-xs text-zinc-500 mt-3">Share this with the assigned technician</p>
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
