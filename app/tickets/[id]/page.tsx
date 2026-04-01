'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InlineEdit } from '@/components/inline-edit'
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
  source: string; ticket_type: string
  contact_name: string | null; contact_email: string | null; contact_phone: string | null
  parent_ticket_id: string | null; parent_ticket_number: number | null; parent_ticket_title: string | null
  sf_case_number: string | null
  image_url: string | null
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
type ContentTab = 'timeline' | 'details' | 'description' | 'emails' | 'notes'

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [relatedTickets, setRelatedTickets] = useState<any[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [showActions, setShowActions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editResolution, setEditResolution] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [cannedResponses, setCannedResponses] = useState<Array<{ id: string; title: string; body: string; category: string }>>([])
  const [showCanned, setShowCanned] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [activeTab, setActiveTab] = useState<ContentTab>('timeline')
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
      setRelatedTickets(ticketData.related_tickets || [])
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
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
                <InlineEdit value={ticket.title} onSave={v => updateField('title', v)} displayClassName="text-xl font-semibold text-zinc-900" />
              </h1>
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
                <span>&middot;</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 text-[10px] font-medium">{(ticket.source || 'web').toUpperCase()}</span>
              </div>
              {ticket.image_url && (
                <div className="mt-2">
                  <img src={ticket.image_url} alt="Issue" className="h-20 w-32 object-cover rounded-lg border border-zinc-200 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(ticket.image_url!, '_blank')} />
                </div>
              )}
            </div>
            {/* Action buttons — SF style */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {ticket.status !== 'closed' && (
                <button
                  onClick={() => updateField('status', 'closed')}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Mark Complete
                </button>
              )}
              {/* Send to Slack + Actions dropdown */}
              <div className="relative">
                <div className="flex">
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`/api/tickets/${params.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: ticket.status }),
                        })
                      } catch {}
                    }}
                    className="px-3 py-1.5 bg-[#0A52EF] text-white text-xs font-medium rounded-l-lg hover:bg-[#0840C0] transition-colors"
                  >
                    Send to Slack
                  </button>
                  <button
                    onClick={() => setShowActions(!showActions)}
                    className="px-1.5 py-1.5 bg-[#0A52EF] text-white rounded-r-lg hover:bg-[#0840C0] transition-colors border-l border-blue-400/30"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                {showActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                      {[
                        { label: 'Change Owner', action: () => { document.querySelector<HTMLSelectElement>('[data-assignee-select]')?.focus(); setShowActions(false) } },
                        { label: 'Clone Ticket', action: async () => {
                          const res = await fetch('/api/tickets', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ venue_id: ticket.venue_id, title: `[Clone] ${ticket.title}`, description: ticket.description, priority: ticket.priority, category: ticket.category, source: ticket.source, ticket_type: ticket.ticket_type, parent_ticket_id: ticket.id }),
                          })
                          if (res.ok) { const d = await res.json(); router.push(`/tickets/${d.id}`) }
                          setShowActions(false)
                        }},
                        { label: 'Create Dev Ticket', action: async () => {
                          const res = await fetch('/api/tickets', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ venue_id: ticket.venue_id, title: `[Dev] ${ticket.title}`, description: ticket.description, priority: ticket.priority, category: ticket.category, ticket_type: 'dev_ticket', parent_ticket_id: ticket.id }),
                          })
                          if (res.ok) { const d = await res.json(); router.push(`/tickets/${d.id}`) }
                          setShowActions(false)
                        }},
                        { label: 'Print View', action: () => { window.print(); setShowActions(false) } },
                      ].map((item, i) => (
                        <button key={i} onClick={item.action}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors">
                          {item.label}
                        </button>
                      ))}
                    </div>
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

        {/* ── Three Column Layout ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-full lg:w-72 lg:min-w-[272px] flex-shrink-0 space-y-6 lg:sticky lg:top-4 self-start">

            {/* Details */}
            <div className="space-y-5">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Details</h3>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Assignee</label>
                <select data-assignee-select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)}
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

            {/* Case Information — SF-style two-column grid */}
            <div className="space-y-3 pt-5 border-t border-zinc-100">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Case Information</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: 'Venue', value: ticket.venue_name, href: `/venues/${ticket.venue_id}` },
                  ticket.event_name ? { label: 'Event', value: ticket.event_name, href: `/events/${ticket.event_id}` } : null,
                  { label: 'Source', value: (ticket.source || 'web').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                  { label: 'Type', value: (ticket.ticket_type || 'support').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                  ticket.sf_case_number ? { label: 'SF Case #', value: ticket.sf_case_number } : null,
                  ticket.parent_ticket_number ? { label: 'Parent Case', value: `T-${String(ticket.parent_ticket_number).padStart(5, '0')}`, href: `/tickets/${ticket.parent_ticket_id}` } : null,
                  { label: 'Created by', value: ticket.created_by_name, href: `/staff/${ticket.created_by}` },
                  { label: 'Created', value: ticket.created_date },
                  { label: 'Updated', value: ticket.updated_date },
                  ticket.resolved_date ? { label: 'Closed', value: ticket.resolved_date } : null,
                ].filter(Boolean).map((item: any, i) => (
                  <div key={i} className="flex justify-between items-center text-xs py-1.5 px-2 rounded hover:bg-zinc-50 group transition-colors">
                    <span className="text-zinc-400 flex-shrink-0">{item.label}</span>
                    <div className="flex items-center gap-1.5 ml-4 min-w-0">
                      {item.href ? (
                        <Link href={item.href} className="text-blue-600 hover:text-blue-800 font-medium truncate">{item.value}</Link>
                      ) : (
                        <span className="text-zinc-700 truncate">{item.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Details — SF style */}
            <div className="space-y-3 pt-5 border-t border-zinc-100">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Contact Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Name</span>
                  <InlineEdit value={ticket.contact_name || ''} onSave={v => updateField('contact_name', v)} emptyText="Add name" displayClassName="text-xs text-zinc-700 font-medium" />
                </div>
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Email</span>
                  <InlineEdit value={ticket.contact_email || ''} onSave={v => updateField('contact_email', v)} emptyText="Add email" displayClassName="text-xs text-zinc-700" />
                </div>
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Phone</span>
                  <InlineEdit value={ticket.contact_phone || ''} onSave={v => updateField('contact_phone', v)} emptyText="Add phone" displayClassName="text-xs text-zinc-700" />
                </div>
              </div>
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

            {/* Related Tickets */}
            {relatedTickets.length > 0 && (
              <div className="space-y-2 pt-5 border-t border-zinc-100">
                <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Related Cases</h3>
                {relatedTickets.map((rt: any) => (
                  <Link key={rt.id} href={`/tickets/${rt.id}`} className="flex items-center justify-between text-xs py-1.5 hover:bg-zinc-50 rounded px-1 -mx-1 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        rt.priority === 'critical' ? 'bg-red-500' : rt.priority === 'high' ? 'bg-orange-500' : rt.priority === 'medium' ? 'bg-amber-400' : 'bg-zinc-300'
                      }`}></span>
                      <span className="text-zinc-500 font-mono">T-{String(rt.ticket_number).padStart(5, '0')}</span>
                      <span className="text-zinc-700 truncate">{rt.title}</span>
                    </div>
                    <span className={`text-[10px] font-medium flex-shrink-0 ml-2 ${rt.status === 'closed' ? 'text-zinc-400' : 'text-zinc-600'}`}>{rt.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Tabbed Content Card ── */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center border-b border-zinc-100 px-1">
                {([
                  { key: 'timeline', label: 'Feed', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { key: 'details', label: 'Details', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
                  { key: 'emails', label: 'Emails', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                  { key: 'notes', label: 'Notes', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-zinc-900 text-zinc-900'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600'
                    }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    </svg>
                    {tab.label}
                    {tab.key === 'emails' && filterCounts.emails > 0 && <span className="text-[10px] text-zinc-300">{filterCounts.emails}</span>}
                    {tab.key === 'notes' && filterCounts.comments > 0 && <span className="text-[10px] text-zinc-300">{filterCounts.comments}</span>}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[300px]">

                {/* ── Timeline Tab ── */}
                {activeTab === 'timeline' && (
                  <div>
                    {/* Resolution banner */}
                    {ticket.status === 'closed' && (
                      <div className="px-6 py-4 bg-emerald-50/50 border-b border-emerald-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-sm font-medium text-emerald-900">Resolved</span>
                          </div>
                          {!editResolution && <button onClick={() => setEditResolution(true)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>}
                        </div>
                        {editResolution ? (
                          <div className="mt-3 space-y-2">
                            <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                              className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white" rows={2} />
                            <div className="flex gap-2">
                              <button onClick={saveResolution} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">Save</button>
                              <button onClick={() => setEditResolution(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
                            </div>
                          </div>
                        ) : resolutionNotes ? (
                          <p className="text-sm text-emerald-800/70 mt-1">{resolutionNotes}</p>
                        ) : null}
                      </div>
                    )}

                    {allTimelineItems.length === 0 ? (
                      <div className="py-20 text-center">
                        <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <p className="text-sm text-zinc-400">No activity yet</p>
                      </div>
                    ) : (
                      <div className="px-6 py-4">
                        <div className="relative space-y-0">
                          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-100" />
                          {allTimelineItems.map((item, idx) => {
                            const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                            if (item.type === 'change') {
                              const log = item.data as Activity
                              const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                              const desc = log.action === 'ticket_created' ? `Ticket created`
                                : log.action === 'ticket_status_change' ? `Status: ${details.old_status?.replace('_', ' ')} \u2192 ${details.new_status?.replace('_', ' ')}`
                                : log.action === 'ticket_assigned' ? `Assigned to ${details.assigned_to}`
                                : log.action === 'ticket_category_change' ? `Category \u2192 ${details.new_category}`
                                : log.action === 'ticket_priority_change' ? `Priority \u2192 ${details.new_priority}`
                                : 'Updated'
                              return (
                                <div key={`a-${idx}`} className="relative flex items-center gap-3 py-2">
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
                              <div key={`c-${comment.id}`} className="relative flex gap-3 py-3">
                                <div className="relative z-10 flex-shrink-0 w-[30px] flex justify-center pt-1">
                                  <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[10px] font-semibold ${
                                    isEmail ? 'bg-blue-100 text-blue-600' : comment.is_internal ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600'
                                  }`}>{getInitials(comment.author_name)}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                    {comment.is_internal && <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal</span>}
                                    {isEmail && <span className="text-[9px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Email</span>}
                                    <span className="text-[10px] text-zinc-300 tabular-nums">{timeStr}</span>
                                  </div>
                                  <div className={`rounded-lg p-4 ${
                                    isEmail ? 'bg-blue-50/40 border border-blue-100' : comment.is_internal ? 'bg-indigo-50/40 border border-indigo-100' : 'bg-zinc-50/50 border border-zinc-100'
                                  }`}>
                                    {isEmail ? (
                                      <div className="max-w-prose"><TicketContent content={comment.body} variant="email" /></div>
                                    ) : (
                                      <div className="max-w-prose"><CommentContent content={comment.body} /></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Comment composer */}
                    <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100">
                      <form onSubmit={addComment}>
                        {showCanned && cannedResponses.length > 0 && (
                          <div className="mb-3 border border-zinc-200 rounded-lg bg-white divide-y divide-zinc-100 max-h-40 overflow-y-auto">
                            {cannedResponses.map(cr => (
                              <button key={cr.id} type="button"
                                onClick={() => { setNewComment(cr.body); setIsInternal(false); setShowCanned(false) }}
                                className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                                <p className="text-xs font-medium text-zinc-900">{cr.title}</p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">{cr.body}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                          placeholder={isInternal ? 'Write an internal note...' : 'Write a client-visible comment...'}
                          className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${isInternal ? 'border-indigo-200 bg-indigo-50/20 focus:ring-indigo-400/20 placeholder:text-indigo-300' : 'border-zinc-200 bg-white focus:ring-blue-500/20 placeholder:text-zinc-300'}`}
                          rows={2} />
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <div className="inline-flex bg-zinc-100/80 rounded-md p-0.5">
                            <button type="button" onClick={() => setShowCanned(!showCanned)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${showCanned ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Quick Replies
                            </button>
                            <button type="button" onClick={() => setIsInternal(false)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${!isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Client
                            </button>
                            <button type="button" onClick={() => setIsInternal(true)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Internal
                            </button>
                          </div>
                          <button type="submit" disabled={submitting || !newComment.trim()}
                            className="bg-zinc-900 text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-all">
                            {submitting ? 'Posting...' : 'Post'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── Details Tab (SF-style two-column field grid) ── */}
                {activeTab === 'details' && (
                  <div className="p-6">
                    {/* Case Information */}
                    <div className="mb-6">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Case Information
                      </h3>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Number</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{caseNum}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Owner</span>
                          <InlineEdit
                            value={ticket.assigned_to || ''}
                            type="select"
                            options={[{ value: '', label: 'Unassigned' }, ...staffList.map(s => ({ value: s.id, label: s.full_name }))]}
                            onSave={v => updateField('assigned_to', v || null)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Type</span>
                          <InlineEdit
                            value={ticket.ticket_type || 'support'}
                            type="select"
                            options={[{ value: 'support', label: 'Support' }, { value: 'dev_ticket', label: 'Dev Ticket' }]}
                            onSave={v => updateField('ticket_type', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Origin</span>
                          <InlineEdit
                            value={ticket.source || 'web'}
                            type="select"
                            options={[{ value: 'web', label: 'Web' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'slack', label: 'Slack' }, { value: 'portal', label: 'Portal' }]}
                            onSave={v => updateField('source', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Account Name</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.venue_name}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Category</span>
                          <InlineEdit
                            value={ticket.category || 'general'}
                            type="select"
                            options={[{ value: 'hardware', label: 'Hardware' }, { value: 'software', label: 'Software' }, { value: 'content', label: 'Content' }, { value: 'operational', label: 'Operational' }, { value: 'general', label: 'General' }]}
                            onSave={v => updateField('category', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Name</span>
                          <InlineEdit value={ticket.contact_name || ''} onSave={v => updateField('contact_name', v)} placeholder="Add contact name" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Email</span>
                          <InlineEdit value={ticket.contact_email || ''} onSave={v => updateField('contact_email', v)} placeholder="email@example.com" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Phone</span>
                          <InlineEdit value={ticket.contact_phone || ''} onSave={v => updateField('contact_phone', v)} placeholder="(555) 123-4567" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        {ticket.sf_case_number && (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">SF Case #</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.sf_case_number}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Created</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.created_date}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Last Modified</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.updated_date}</span>
                        </div>
                        {ticket.resolved_date && (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">Closed</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.resolved_date}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Created By</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.created_by_name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Subject + Description */}
                    <div className="mb-6">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Description Information
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <span className="text-[11px] text-zinc-400 block">Subject</span>
                          <InlineEdit value={ticket.title} onSave={v => updateField('title', v)} displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div>
                          <span className="text-[11px] text-zinc-400 block mb-1">Description</span>
                          <InlineEdit
                            value={ticket.description || ''}
                            type="textarea"
                            onSave={v => updateField('description', v)}
                            placeholder="Add description..."
                            emptyText="No description"
                            displayClassName="text-sm text-zinc-700"
                          />
                        </div>
                        {ticket.resolution_notes && (
                          <div>
                            <span className="text-[11px] text-zinc-400 block mb-1">Resolution Notes</span>
                            <div className="text-sm text-zinc-700 bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                              {ticket.resolution_notes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Additional Information */}
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Additional Information
                      </h3>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        {[
                          ['Status', ticket.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())],
                          ['Priority', ticket.priority.replace(/\b\w/g, (c: string) => c.toUpperCase())],
                          ['Date/Time Opened', ticket.created_date],
                          ['Date/Time Closed', ticket.resolved_date || '—'],
                          ['Last Modified', ticket.updated_date],
                          ['Created By', ticket.created_by_name],
                        ].map(([label, value], i) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">{label}</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Emails Tab ── */}
                {activeTab === 'emails' && (
                  <div className="p-6">
                    {filterCounts.emails === 0 && !ticket.original_message ? (
                      <p className="text-sm text-zinc-400 py-10 text-center">No emails on this ticket</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Original email from ticket creation */}
                        {ticket.original_message && (
                          <div className="border border-blue-100 rounded-lg p-4 bg-blue-50/20">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              </div>
                              <span className="text-xs font-semibold text-zinc-900">Original Email</span>
                              <span className="text-[10px] text-zinc-300 tabular-nums ml-auto">{ticket.created_date}</span>
                            </div>
                            <div className="max-w-prose"><TicketContent content={ticket.original_message} variant="email" /></div>
                          </div>
                        )}
                        {/* Email comments from timeline */}
                        {allTimelineItems.filter(i => i.type === 'email').map((item, idx) => {
                          const comment = item.data as Comment
                          const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                          return (
                            <div key={idx} className="border border-blue-100 rounded-lg p-4 bg-blue-50/20">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-semibold">{getInitials(comment.author_name)}</div>
                                <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                <span className="text-[10px] text-zinc-300 tabular-nums ml-auto">{timeStr}</span>
                              </div>
                              <div className="max-w-prose"><TicketContent content={comment.body} variant="email" /></div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Notes Tab ── */}
                {activeTab === 'notes' && (
                  <div>
                    <div className="p-6">
                      {filterCounts.comments === 0 ? (
                        <p className="text-sm text-zinc-400 py-10 text-center">No notes yet — add one below</p>
                      ) : (
                        <div className="space-y-4">
                          {allTimelineItems.filter(i => i.type === 'comment').map((item, idx) => {
                            const comment = item.data as Comment
                            const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                            return (
                              <div key={idx} className={`border rounded-lg p-4 ${comment.is_internal ? 'border-indigo-100 bg-indigo-50/20' : 'border-zinc-100 bg-zinc-50/30'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${comment.is_internal ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600'}`}>{getInitials(comment.author_name)}</div>
                                  <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                  {comment.is_internal && <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase">Internal</span>}
                                  <span className="text-[10px] text-zinc-300 tabular-nums ml-auto">{timeStr}</span>
                                </div>
                                <div className="max-w-prose"><CommentContent content={comment.body} /></div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {/* Note composer */}
                    <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100">
                      <form onSubmit={addComment}>
                        <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                          placeholder={isInternal ? 'Write an internal note...' : 'Write a client-visible note...'}
                          className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${isInternal ? 'border-indigo-200 bg-indigo-50/20 focus:ring-indigo-400/20 placeholder:text-indigo-300' : 'border-zinc-200 bg-white focus:ring-blue-500/20 placeholder:text-zinc-300'}`}
                          rows={2} />
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <div className="inline-flex bg-zinc-100/80 rounded-md p-0.5">
                            <button type="button" onClick={() => setIsInternal(false)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${!isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Client
                            </button>
                            <button type="button" onClick={() => setIsInternal(true)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Internal
                            </button>
                          </div>
                          <button type="submit" disabled={submitting || !newComment.trim()}
                            className="bg-zinc-900 text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-all">
                            {submitting ? 'Posting...' : 'Add Note'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR: Related Objects (SF-style) ── */}
          <div className="w-full lg:w-56 lg:min-w-[224px] flex-shrink-0 space-y-3">
            {[
              {
                title: 'Related Cases',
                icon: '🔗',
                color: 'from-orange-500 to-red-500',
                items: relatedTickets,
                render: (item: any) => (
                  <Link key={item.id} href={`/tickets/${item.id}`} className="flex items-center gap-2 py-1.5 px-2 text-xs hover:bg-zinc-50 rounded transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      item.priority === 'critical' ? 'bg-red-500' : item.priority === 'high' ? 'bg-orange-500' : 'bg-zinc-300'
                    }`}></span>
                    <span className="text-zinc-700 truncate">{item.title}</span>
                  </Link>
                ),
              },
              {
                title: 'Dev Tickets',
                icon: '🛠',
                color: 'from-violet-500 to-purple-500',
                items: relatedTickets.filter((t: any) => t.ticket_type === 'dev_ticket'),
                render: (item: any) => (
                  <Link key={item.id} href={`/tickets/${item.id}`} className="flex items-center gap-2 py-1.5 px-2 text-xs hover:bg-zinc-50 rounded transition-colors">
                    <span className="text-violet-500 text-[10px]">●</span>
                    <span className="text-zinc-700 truncate">{item.title}</span>
                  </Link>
                ),
              },
            ].map((panel) => (
              <details key={panel.title} open className="group">
                <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gradient-to-r ${panel.color} cursor-pointer select-none"
                  style={{ background: `linear-gradient(135deg, ${panel.color.includes('orange') ? '#f97316, #ef4444' : '#8b5cf6, #a855f7'})` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{panel.icon}</span>
                    <span className="text-white text-xs font-semibold">{panel.title} ({panel.items.length})</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-white/80 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden">
                  {panel.items.length > 0 ? (
                    <div className="divide-y divide-zinc-100">
                      {panel.items.map(panel.render)}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-400 text-center py-3">None</p>
                  )}
                </div>
              </details>
            ))}

            {/* Venue Equipment */}
            <details open className="group">
              <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer select-none"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">📦</span>
                  <span className="text-white text-xs font-semibold">Account Assets</span>
                </div>
                <svg className="w-3.5 h-3.5 text-white/80 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <Link href={`/venues/${ticket.venue_id}`} className="flex items-center gap-2 py-2 px-3 text-xs text-blue-600 hover:bg-zinc-50 transition-colors">
                  View {ticket.venue_name} assets →
                </Link>
              </div>
            </details>

            {/* Parts */}
            <details open className="group">
              <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer select-none"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔧</span>
                  <span className="text-white text-xs font-semibold">Parts (0)</span>
                </div>
                <svg className="w-3.5 h-3.5 text-white/80 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <p className="text-[11px] text-zinc-400 text-center py-3">None</p>
              </div>
            </details>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
