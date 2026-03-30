'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { TicketContent, CommentContent } from '@/components/ticket-content'
import Link from 'next/link'

interface TicketDetail {
  id: string; ticket_number: number; title: string; description: string
  priority: string; status: string; category: string; resolution_notes: string | null
  event_id: string | null; event_name: string | null; venue_name: string; venue_id: string
  created_by: string; created_by_name: string; assigned_to_name: string | null; assigned_to: string | null
  created_date: string; updated_date: string; resolved_date: string | null
  sla_response_due: string | null; sla_resolution_due: string | null
  sla_response_met: boolean | null; sla_resolution_met: boolean | null
  first_response_at: string | null
  original_message: string | null
}
interface Comment { id: string; body: string; is_internal: boolean; author_name: string; created_date: string }
interface Activity { action: string; staff_id: string | null; details: any; created_at: string }
interface Staff { id: string; full_name: string }

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'text-zinc-500 bg-zinc-50 border-zinc-200', label: 'Low' },
  medium: { color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Medium' },
  high: { color: 'text-orange-700 bg-orange-50 border-orange-200', label: 'High' },
  critical: { color: 'text-red-700 bg-red-50 border-red-200', label: 'Critical' },
}
const statusSteps = [
  { key: 'new', label: 'New', color: '#3b82f6' },
  { key: 'on_hold', label: 'On Hold', color: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'escalated', label: 'Escalated', color: '#ef4444' },
  { key: 'closed', label: 'Closed', color: '#6b7280' },
]
const categoryLabels: Record<string, string> = {
  hardware: 'Hardware', software: 'Software', content: 'Content', operational: 'Operational', general: 'General',
}

type TimelineFilter = 'all' | 'comments' | 'emails' | 'changes'

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editResolution, setEditResolution] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [cannedResponses, setCannedResponses] = useState<Array<{ id: string; title: string; body: string; category: string }>>([])
  const [showCanned, setShowCanned] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [ticketRes, staffRes] = await Promise.all([
        fetch(`/api/tickets/${params.id}`),
        fetch('/api/staff'),
      ])
      const ticketData = await ticketRes.json()
      const staffData = await staffRes.json()
      setTicket(ticketData.ticket)
      setComments(ticketData.comments || [])
      setActivity(ticketData.activity || [])
      setStaffList(staffData.staff || [])
      setResolutionNotes(ticketData.ticket?.resolution_notes || '')
      const cannedRes = await fetch('/api/tickets/canned')
      if (cannedRes.ok) { const cd = await cannedRes.json(); setCannedResponses(cd.responses || []) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [params.id])

  const updateField = async (field: string, value: any) => {
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) await fetchData()
    } catch {}
  }

  const addComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tickets/${params.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment, is_internal: isInternal })
      })
      if (res.ok) { setNewComment(''); await fetchData() }
    } catch {} finally { setSubmitting(false) }
  }

  const saveResolution = async () => {
    await updateField('resolution_notes', resolutionNotes)
    setEditResolution(false)
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    const p = name.split(' ')
    return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase()
  }

  if (loading) return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-14 w-full" />
        <div className="flex gap-8"><Skeleton className="h-96 w-80" /><Skeleton className="h-96 flex-1" /></div>
      </div>
    </DashboardLayout>
  )
  if (!ticket) return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto py-20 text-center">
        <p className="text-zinc-400 text-sm">Ticket not found</p>
      </div>
    </DashboardLayout>
  )

  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
  const currentStepIdx = statusSteps.findIndex(s => s.key === ticket.status)
  const caseNum = `T-${ticket.ticket_number}`

  const allTimelineItems: Array<{ type: 'comment' | 'email' | 'change'; data: any; time: Date }> = []
  comments.forEach(c => {
    const isEmail = c.author_name === 'ANC Bot' && !c.is_internal
    allTimelineItems.push({ type: isEmail ? 'email' : 'comment', data: c, time: new Date(c.created_date) })
  })
  activity.forEach(a => allTimelineItems.push({ type: 'change', data: a, time: new Date(a.created_at) }))
  allTimelineItems.sort((a, b) => a.time.getTime() - b.time.getTime())

  const filteredTimeline = timelineFilter === 'all' ? allTimelineItems
    : timelineFilter === 'comments' ? allTimelineItems.filter(i => i.type === 'comment')
    : timelineFilter === 'emails' ? allTimelineItems.filter(i => i.type === 'email')
    : allTimelineItems.filter(i => i.type === 'change')

  const filterCounts = {
    all: allTimelineItems.length,
    comments: comments.filter(c => c.author_name !== 'ANC Bot' || c.is_internal).length,
    emails: comments.filter(c => c.author_name === 'ANC Bot' && !c.is_internal).length,
    changes: activity.length,
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">

        {/* ── Header ── */}
        <div className="space-y-4">
          <button onClick={() => router.push('/tickets')} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Tickets
          </button>
          <div className="flex items-start gap-4">
            <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-100 px-2.5 py-1.5 rounded-md mt-0.5 flex-shrink-0">{caseNum}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-zinc-900 leading-tight">{ticket.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                <span>Opened by <span className="text-zinc-600 font-medium">{ticket.created_by_name}</span></span>
                <span>&middot;</span>
                <span>{ticket.created_date}</span>
                {ticket.venue_name && (
                  <>
                    <span>&middot;</span>
                    <Link href={`/venues/${ticket.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium">{ticket.venue_name}</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Status Steps ── */}
        <div className="flex items-center gap-1">
          {statusSteps.map((step, idx) => {
            const isActive = step.key === ticket.status
            const isPast = idx < currentStepIdx
            return (
              <button key={step.key} onClick={() => updateField('status', step.key)}
                className="flex-1 group" title={`Set to ${step.label}`}>
                <div className={`h-1.5 rounded-full transition-all ${isActive ? 'scale-y-150' : 'group-hover:scale-y-125'}`}
                  style={{ backgroundColor: isActive ? step.color : isPast ? step.color + '60' : '#e4e4e7' }} />
                <p className={`text-[10px] font-medium mt-1.5 text-center transition-colors ${isActive ? 'text-zinc-900' : isPast ? 'text-zinc-500' : 'text-zinc-300'}`}>
                  {step.label}
                </p>
              </button>
            )
          })}
        </div>

        {/* ── Two Column Layout ── */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-full lg:w-72 lg:min-w-[272px] flex-shrink-0 space-y-6 lg:sticky lg:top-4 self-start">

            {/* Details */}
            <div className="space-y-5">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Details</h3>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Assignee</label>
                <select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none bg-white transition-colors">
                  <option value="">Unassigned</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Priority</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(priorityConfig).map(([key, cfg]) => (
                    <button key={key} onClick={() => updateField('priority', key)}
                      className={`text-[11px] font-medium py-1.5 rounded-md transition-all text-center border ${ticket.priority === key ? cfg.color : 'text-zinc-400 bg-white border-zinc-200 hover:border-zinc-300'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <button key={key} onClick={() => updateField('category', key)}
                      className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all border ${ticket.category === key ? 'text-zinc-900 bg-zinc-100 border-zinc-300' : 'text-zinc-400 bg-white border-zinc-200 hover:border-zinc-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-3 pt-5 border-t border-zinc-100">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Info</h3>
              {[
                { label: 'Venue', value: ticket.venue_name, href: `/venues/${ticket.venue_id}` },
                ticket.event_name ? { label: 'Event', value: ticket.event_name, href: `/events/${ticket.event_id}` } : null,
                { label: 'Created by', value: ticket.created_by_name, href: `/staff/${ticket.created_by}` },
                { label: 'Created', value: ticket.created_date },
                { label: 'Updated', value: ticket.updated_date },
                ticket.resolved_date ? { label: 'Closed', value: ticket.resolved_date } : null,
              ].filter(Boolean).map((item: any, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">{item.label}</span>
                  {item.href ? (
                    <Link href={item.href} className="text-blue-600 hover:text-blue-800 font-medium truncate ml-4">{item.value}</Link>
                  ) : (
                    <span className="text-zinc-600 truncate ml-4">{item.value}</span>
                  )}
                </div>
              ))}
            </div>

            {/* SLA */}
            {(ticket.sla_response_due || ticket.sla_resolution_due) && (
              <div className="space-y-4 pt-5 border-t border-zinc-100">
                <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">SLA</h3>
                {ticket.sla_response_due && (() => {
                  const due = new Date(ticket.sla_response_due)
                  const now = new Date()
                  const responded = !!ticket.first_response_at
                  const breached = !responded && now > due
                  const met = ticket.sla_response_met
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Response</span>
                        {responded ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${met ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{met ? 'Met' : 'Breached'}</span>
                        ) : breached ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Overdue</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">{due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                      {!responded && !breached && (
                        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - new Date(ticket.created_date).getTime()) / (due.getTime() - new Date(ticket.created_date).getTime())) * 100))}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })()}
                {ticket.sla_resolution_due && (() => {
                  const due = new Date(ticket.sla_resolution_due)
                  const now = new Date()
                  const resolved = ticket.status === 'closed'
                  const breached = !resolved && now > due
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Resolution</span>
                        {resolved ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ticket.sla_resolution_met ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{ticket.sla_resolution_met ? 'Met' : 'Breached'}</span>
                        ) : breached ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Overdue</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">{due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                      {!resolved && !breached && (
                        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - new Date(ticket.created_date).getTime()) / (due.getTime() - new Date(ticket.created_date).getTime())) * 100))}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* ── RIGHT CONTENT ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Description */}
            <div className="space-y-4">
              {ticket.description && (
                <div className="bg-white rounded-xl border border-zinc-200/80 p-6">
                  <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Description</h3>
                  <div className="max-w-prose">
                    <TicketContent content={ticket.description} variant="description" />
                  </div>
                </div>
              )}

              {ticket.original_message && ticket.original_message !== ticket.description && (
                <div className="bg-zinc-50/50 rounded-xl border border-zinc-200/60 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Original Email</h3>
                  </div>
                  <div className="max-w-prose">
                    <TicketContent content={ticket.original_message} variant="email" />
                  </div>
                </div>
              )}
            </div>

            {/* Resolution */}
            {ticket.status === 'closed' && (
              <div className="bg-emerald-50/50 rounded-xl border border-emerald-200/60 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <h3 className="text-sm font-semibold text-emerald-900">Resolution</h3>
                  </div>
                  {!editResolution && <button onClick={() => setEditResolution(true)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>}
                </div>
                {editResolution ? (
                  <div className="space-y-3">
                    <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                      className="w-full border border-emerald-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white" rows={3} />
                    <div className="flex gap-2">
                      <button onClick={saveResolution} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors">Save</button>
                      <button onClick={() => setEditResolution(false)} className="text-xs text-zinc-500 px-4 py-2 hover:text-zinc-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-800/80 leading-relaxed">{resolutionNotes || 'No resolution notes yet.'}</p>
                )}
              </div>
            )}

            {/* ── Timeline ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900">Timeline</h3>
                <div className="flex items-center gap-0.5 bg-zinc-100/80 rounded-lg p-0.5">
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'comments', label: 'Notes' },
                    { key: 'emails', label: 'Emails' },
                    { key: 'changes', label: 'Changes' },
                  ] as const).map(f => (
                    <button key={f.key} onClick={() => setTimelineFilter(f.key)}
                      className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${timelineFilter === f.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                      {f.label}
                      {filterCounts[f.key] > 0 && <span className="ml-1 text-zinc-400">{filterCounts[f.key]}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTimeline.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-sm text-zinc-400">No activity yet</p>
                </div>
              ) : (
                <div className="relative space-y-0">
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-100" />

                  {filteredTimeline.map((item, idx) => {
                    const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

                    if (item.type === 'change') {
                      const log = item.data as Activity
                      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                      const desc = log.action === 'ticket_created' ? `Ticket created`
                        : log.action === 'ticket_status_change' ? `Status: ${details.old_status?.replace('_', ' ')} → ${details.new_status?.replace('_', ' ')}`
                        : log.action === 'ticket_assigned' ? `Assigned to ${details.assigned_to}`
                        : log.action === 'ticket_category_change' ? `Category → ${details.new_category}`
                        : log.action === 'ticket_priority_change' ? `Priority → ${details.new_priority}`
                        : 'Updated'

                      return (
                        <div key={`a-${idx}`} className="relative flex items-center gap-3 py-2 pl-0">
                          <div className="relative z-10 flex-shrink-0 w-[30px] flex justify-center">
                            <div className="w-2 h-2 rounded-full bg-zinc-300" />
                          </div>
                          <span className="text-xs text-zinc-400 flex-1">{desc}</span>
                          <span className="text-[10px] text-zinc-300 flex-shrink-0 tabular-nums">{timeStr}</span>
                        </div>
                      )
                    }

                    const comment = item.data as Comment
                    const isEmail = item.type === 'email'

                    return (
                      <div key={`c-${comment.id}`} className="relative flex gap-3 py-3 pl-0">
                        <div className="relative z-10 flex-shrink-0 w-[30px] flex justify-center pt-1">
                          <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[10px] font-semibold ${
                            isEmail ? 'bg-blue-100 text-blue-600' : comment.is_internal ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-600'
                          }`}>
                            {getInitials(comment.author_name)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                            {comment.is_internal && <span className="text-[9px] font-semibold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal</span>}
                            {isEmail && <span className="text-[9px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Email</span>}
                            <span className="text-[10px] text-zinc-300 tabular-nums">{timeStr}</span>
                          </div>
                          <div className={`rounded-lg p-4 ${
                            isEmail ? 'bg-blue-50/40 border border-blue-100' : comment.is_internal ? 'bg-amber-50/40 border border-amber-100' : 'bg-zinc-50/50 border border-zinc-100'
                          }`}>
                            {comment.body.includes('Q:') && comment.body.includes('A:') ? (
                              <div className="space-y-2">
                                {comment.body.split('\n\n').filter(Boolean).map((block: string, bi: number) => {
                                  const lines = block.split('\n')
                                  const q = lines.find((l: string) => l.startsWith('Q:'))?.replace('Q: ', '') || ''
                                  const a = lines.find((l: string) => l.startsWith('A:'))?.replace('A: ', '') || ''
                                  return q ? (
                                    <div key={bi}>
                                      <p className="text-[11px] text-zinc-400">{q}</p>
                                      <p className="text-[13px] text-zinc-700 mt-0.5">{a}</p>
                                    </div>
                                  ) : null
                                })}
                              </div>
                            ) : isEmail ? (
                              <div className="max-w-prose">
                                <TicketContent content={comment.body} variant="email" />
                              </div>
                            ) : (
                              <div className="max-w-prose">
                                <CommentContent content={comment.body} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Comment composer */}
              <div className="mt-6 pt-6 border-t border-zinc-100">
                <form onSubmit={addComment}>
                  {showCanned && cannedResponses.length > 0 && (
                    <div className="mb-3 border border-zinc-200 rounded-lg bg-white divide-y divide-zinc-100 max-h-48 overflow-y-auto">
                      {cannedResponses.map(cr => (
                        <button key={cr.id} type="button"
                          onClick={() => { setNewComment(cr.body); setIsInternal(false); setShowCanned(false) }}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors">
                          <p className="text-xs font-medium text-zinc-900">{cr.title}</p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{cr.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder={isInternal ? 'Write an internal note...' : 'Write a client-visible comment...'}
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${isInternal ? 'border-amber-200 bg-amber-50/20 focus:ring-amber-400/20 placeholder:text-amber-300' : 'border-zinc-200 bg-white focus:ring-blue-500/20 placeholder:text-zinc-300'}`}
                    rows={3} />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
                    <div className="inline-flex bg-zinc-100/80 rounded-lg p-0.5">
                      <button type="button" onClick={() => setShowCanned(!showCanned)}
                        className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${showCanned ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                        Quick Replies
                      </button>
                      <button type="button" onClick={() => setIsInternal(false)}
                        className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${!isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                        Client-visible
                      </button>
                      <button type="button" onClick={() => setIsInternal(true)}
                        className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                        Internal
                      </button>
                    </div>
                    <button type="submit" disabled={submitting || !newComment.trim()}
                      className="bg-zinc-900 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-all">
                      {submitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
