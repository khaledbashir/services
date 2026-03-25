'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import Link from 'next/link'

interface TicketDetail {
  id: string; ticket_number: number; title: string; description: string
  priority: string; status: string; category: string; resolution_notes: string | null
  event_id: string | null; event_name: string | null; venue_name: string; venue_id: string
  created_by_name: string; assigned_to_name: string | null; assigned_to: string | null
  created_date: string; updated_date: string; resolved_date: string | null
  sla_response_due: string | null; sla_resolution_due: string | null
  sla_response_met: boolean | null; sla_resolution_met: boolean | null
  first_response_at: string | null
  original_message: string | null
}
interface Comment { id: string; body: string; is_internal: boolean; author_name: string; created_date: string }
interface Activity { action: string; staff_id: string | null; details: any; created_at: string }
interface Staff { id: string; full_name: string }

const priorityConfig: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  low: { dot: 'bg-zinc-400', bg: 'bg-zinc-50', text: 'text-zinc-600', label: 'Low' },
  medium: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium' },
  high: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', label: 'High' },
  critical: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Critical' },
}
const statusConfig: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  new: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'New' },
  on_hold: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', label: 'On Hold' },
  in_progress: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'In Progress' },
  escalated: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Escalated' },
  closed: { dot: 'bg-zinc-400', bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Closed' },
}
const statusFlow = ['new', 'on_hold', 'in_progress', 'escalated', 'closed']
const statusFlowColors: Record<string, string> = {
  new: '#0A52EF', on_hold: '#7c3aed', in_progress: '#d97706', escalated: '#ea580c', closed: '#64748b',
}
const categoryConfig: Record<string, { bg: string; text: string }> = {
  hardware: { bg: 'bg-red-50', text: 'text-red-600' },
  software: { bg: 'bg-violet-50', text: 'text-violet-600' },
  content: { bg: 'bg-amber-50', text: 'text-amber-600' },
  operational: { bg: 'bg-blue-50', text: 'text-blue-600' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

type FeedTab = 'all' | 'comments' | 'emails' | 'activity'

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
  const [feedTab, setFeedTab] = useState<FeedTab>('all')
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

  const getInitials = (name: string | null | undefined) => { if (!name) return '?'; const p = name.split(' '); return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase() }

  if (loading) return <DashboardLayout><div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>
  if (!ticket) return <DashboardLayout><div className="bg-white rounded border border-[#E8E8E8] p-12 text-center"><p className="text-zinc-500">Ticket not found</p></div></DashboardLayout>

  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
  const st = statusConfig[ticket.status] || statusConfig.new
  const currentStepIdx = statusFlow.indexOf(ticket.status)
  const cat = categoryConfig[ticket.category] || categoryConfig.general
  const caseNum = String(ticket.ticket_number).padStart(8, '0')

  // Filter feed items
  const emailComments = comments.filter(c => c.author_name === 'ANC Bot' && !c.is_internal)
  const regularComments = comments.filter(c => c.author_name !== 'ANC Bot' || c.is_internal)
  const filteredComments = feedTab === 'comments' ? regularComments
    : feedTab === 'emails' ? emailComments
    : feedTab === 'activity' ? []
    : comments
  const showActivity = feedTab === 'all' || feedTab === 'activity'

  // Build unified timeline for "all" tab
  const feedItems: Array<{ type: 'comment' | 'activity'; data: any; time: Date }> = []
  if (feedTab === 'all' || feedTab === 'comments' || feedTab === 'emails') {
    filteredComments.forEach(c => feedItems.push({ type: 'comment', data: c, time: new Date(c.created_date) }))
  }
  if (showActivity) {
    activity.forEach(a => feedItems.push({ type: 'activity', data: a, time: new Date(a.created_at) }))
  }
  feedItems.sort((a, b) => b.time.getTime() - a.time.getTime())

  const tabCounts = {
    all: comments.length + activity.length,
    comments: regularComments.length,
    emails: emailComments.length,
    activity: activity.length,
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Top bar */}
        <div className="space-y-2">
          <button onClick={() => router.push('/tickets')} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Tickets
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-[#002C73] text-white px-3 py-1 rounded text-xs font-bold tracking-wide flex-shrink-0">{caseNum}</div>
            <h1 className="text-base lg:text-lg font-bold text-zinc-900 line-clamp-2">{ticket.title}</h1>
          </div>
        </div>

        {/* Status Stepper */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E8E8E8] overflow-hidden">
          <div className="flex">
            {statusFlow.map((step, idx) => {
              const isActive = step === ticket.status
              const isPast = idx < currentStepIdx
              const color = statusFlowColors[step]
              const cfg = statusConfig[step]
              return (
                <button key={step} onClick={() => updateField('status', step)}
                  className="flex-1 relative transition-all hover:brightness-95"
                  title={`Set status to ${cfg?.label}`}>
                  <div className="py-3 px-2 text-center text-xs font-bold tracking-wide transition-colors flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: isActive ? color : isPast ? `${color}18` : '#f8fafc',
                      color: isActive ? '#fff' : isPast ? color : '#cbd5e1',
                      clipPath: idx === statusFlow.length - 1
                        ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)'
                        : idx === 0
                        ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)'
                        : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',
                    }}>
                    {isPast && <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    {cfg?.label || step}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Two-column: Details left, Feed right — stacks on mobile */}
        <div className="flex flex-col lg:flex-row gap-5">
          {/* LEFT: Details sidebar */}
          <div className="space-y-4 lg:sticky lg:top-4 self-start w-full lg:w-80 lg:min-w-[280px] lg:max-w-[340px] flex-shrink-0">
            {/* Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E8E8E8] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">Details</h3>
              </div>
              <div className="p-5 space-y-4 text-xs">
                {/* Assignee */}
                <div>
                  <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Assignee</span>
                  <select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)}
                    className="w-full mt-1.5 border border-[#E8E8E8] rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#0A52EF]/30 outline-none text-zinc-700">
                    <option value="">Unassigned</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                {/* Priority */}
                <div>
                  <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Priority</span>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 mt-1.5">
                    {Object.entries(priorityConfig).map(([key, cfg]) => (
                      <button key={key} onClick={() => updateField('priority', key)}
                        className={`text-[11px] font-semibold py-2 rounded-md transition-all text-center border ${ticket.priority === key ? `${cfg.bg} ${cfg.text} border-current/20` : 'text-zinc-400 hover:bg-zinc-50 bg-white border-[#E8E8E8]'}`}>
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Category */}
                <div>
                  <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Category</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {Object.entries(categoryConfig).map(([key, cfg]) => (
                      <button key={key} onClick={() => updateField('category', key)}
                        className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all capitalize border ${ticket.category === key ? `${cfg.bg} ${cfg.text} border-current/20` : 'text-zinc-400 bg-white border-[#E8E8E8] hover:border-zinc-300'}`}>
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Venue */}
                <div className="border-t border-[#E8E8E8] pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Venue</span>
                    <Link href={`/venues/${ticket.venue_id}`} className="text-[#0A52EF] font-medium hover:underline">{ticket.venue_name}</Link>
                  </div>
                  {ticket.event_name && (
                    <div className="flex justify-between mb-2">
                      <span className="text-zinc-400">Event</span>
                      <Link href={`/events/${ticket.event_id}`} className="text-[#0A52EF] font-medium hover:underline truncate ml-2">{ticket.event_name}</Link>
                    </div>
                  )}
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Created by</span>
                    <span className="text-zinc-700 font-medium">{ticket.created_by_name}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Created</span>
                    <span className="text-zinc-700">{ticket.created_date}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Updated</span>
                    <span className="text-zinc-700">{ticket.updated_date}</span>
                  </div>
                  {ticket.resolved_date && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Closed</span>
                      <span className="text-zinc-700">{ticket.resolved_date}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SLA Card */}
            {(ticket.sla_response_due || ticket.sla_resolution_due) && (
              <div className="bg-white rounded-xl shadow-sm border border-[#E8E8E8] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E8E8E8]">
                  <h3 className="text-sm font-bold text-zinc-900">SLA Compliance</h3>
                </div>
                <div className="p-5 space-y-4">
                  {ticket.sla_response_due && (() => {
                    const due = new Date(ticket.sla_response_due)
                    const now = new Date()
                    const met = ticket.sla_response_met
                    const responded = !!ticket.first_response_at
                    const breached = !responded && now > due
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-600">Response Time</span>
                          {responded ? (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${met ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{met ? 'Met' : 'Breached'}</span>
                          ) : breached ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 animate-pulse">Overdue</span>
                          ) : (
                            <span className="text-[11px] text-zinc-500">Due {due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          )}
                        </div>
                        {!responded && !breached && (
                          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-[#0A52EF] rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - (new Date(ticket.created_date).getTime())) / (due.getTime() - (new Date(ticket.created_date).getTime()))) * 100))}%` }} />
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
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-600">Resolution Time</span>
                          {resolved ? (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ticket.sla_resolution_met ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{ticket.sla_resolution_met ? 'Met' : 'Breached'}</span>
                          ) : breached ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 animate-pulse">Overdue</span>
                          ) : (
                            <span className="text-[11px] text-zinc-500">Due {due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          )}
                        </div>
                        {!resolved && !breached && (
                          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - (new Date(ticket.created_date).getTime())) / (due.getTime() - (new Date(ticket.created_date).getTime()))) * 100))}%` }} />
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Tabbed Feed (70%) */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Description */}
            {ticket.description && (
              <div className="bg-white rounded-xl shadow-sm border border-[#E8E8E8] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Description</p>
                  <span className="text-[11px] text-zinc-400">by {ticket.created_by_name} &middot; {ticket.created_date}</span>
                  {ticket.event_name && <Link href={`/events/${ticket.event_id}`} className="text-[11px] text-[#0A52EF] hover:underline ml-auto">{ticket.event_name}</Link>}
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed">{ticket.description}</p>
                {ticket.original_message && ticket.original_message !== ticket.description && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Original Message</p>
                      <p className="text-xs text-zinc-600 italic leading-relaxed">"{ticket.original_message}"</p>
                    </div>
                    <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">AI Summary</p>
                      <p className="text-xs text-blue-900 leading-relaxed">{ticket.description}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resolution */}
            {ticket.status === 'closed' && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Resolution
                  </h3>
                  {!editResolution && <button onClick={() => setEditResolution(true)} className="text-xs text-emerald-700 hover:underline font-medium">Edit</button>}
                </div>
                {editResolution ? (
                  <div className="space-y-2">
                    <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                      className="w-full border border-emerald-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white" rows={3} />
                    <div className="flex gap-2">
                      <button onClick={saveResolution} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700">Save</button>
                      <button onClick={() => setEditResolution(false)} className="text-xs text-zinc-500 px-4 py-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-800">{resolutionNotes || 'No resolution notes yet'}</p>
                )}
              </div>
            )}

            {/* Tabbed Feed */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E8E8E8] overflow-hidden">
              {/* Tabs */}
              <div className="border-b border-[#E8E8E8] flex px-5">
                {([
                  { key: 'all', label: 'All', icon: '≡' },
                  { key: 'comments', label: 'Comments', icon: '💬' },
                  { key: 'emails', label: 'Emails', icon: '✉' },
                  { key: 'activity', label: 'Activity', icon: '🕐' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setFeedTab(tab.key)}
                    className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${feedTab === tab.key ? 'border-[#0A52EF] text-[#0A52EF]' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                    <span>{tab.icon}</span>
                    {tab.label}
                    {tabCounts[tab.key] > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${feedTab === tab.key ? 'bg-[#0A52EF]/10 text-[#0A52EF]' : 'bg-zinc-100 text-zinc-500'}`}>
                        {tabCounts[tab.key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Feed Items */}
              {feedItems.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <p className="text-sm text-zinc-500 font-medium">No {feedTab === 'all' ? 'activity' : feedTab} yet</p>
                  <p className="text-xs text-zinc-400 mt-1">Post an internal note or send a client-visible comment to get started.</p>
                </div>
              ) : (
                <div>
                  {feedItems.map((item, idx) => {
                    if (item.type === 'comment') {
                      const comment = item.data as Comment
                      const isEmail = comment.author_name === 'ANC Bot' && !comment.is_internal
                      return (
                        <div key={`c-${comment.id}`} className={`px-5 py-4 border-b border-[#E8E8E8] last:border-b-0 ${comment.is_internal ? 'bg-amber-50/30' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isEmail ? 'bg-blue-100 text-blue-600' : comment.is_internal ? 'bg-amber-100 text-amber-700' : 'bg-[#0A52EF]/10 text-[#0A52EF]'
                            }`}>
                              {isEmail ? '✉' : getInitials(comment.author_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-zinc-900">{comment.author_name}</span>
                                {comment.is_internal && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Internal</span>}
                                {isEmail && <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Via Email</span>}
                                <span className="text-[11px] text-zinc-400 ml-auto">{comment.created_date}</span>
                              </div>
                              {comment.body.includes('Q:') && comment.body.includes('A:') ? (
                                <div className="mt-2 space-y-2">
                                  {comment.body.split('\n\n').filter(Boolean).map((block: string, bi: number) => {
                                    const lines = block.split('\n')
                                    const q = lines.find((l: string) => l.startsWith('Q:'))?.replace('Q: ', '') || ''
                                    const a = lines.find((l: string) => l.startsWith('A:'))?.replace('A: ', '') || ''
                                    return q ? (
                                      <div key={bi} className="bg-zinc-50 rounded-lg p-3">
                                        <p className="text-xs font-medium text-zinc-500">{q}</p>
                                        <p className="text-sm text-zinc-900 mt-1 font-medium">{a}</p>
                                      </div>
                                    ) : null
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    } else {
                      const log = item.data as Activity
                      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                      const actionIcons: Record<string, string> = {
                        ticket_created: '🎫',
                        ticket_status_change: '🔄',
                        ticket_assigned: '👤',
                        ticket_category_change: '🏷',
                        ticket_priority_change: '⚡',
                        email_reply: '📧',
                      }
                      const actionColors: Record<string, string> = {
                        ticket_created: 'bg-blue-100 text-blue-600',
                        ticket_status_change: 'bg-amber-100 text-amber-600',
                        ticket_assigned: 'bg-violet-100 text-violet-600',
                        ticket_category_change: 'bg-zinc-100 text-zinc-600',
                        ticket_priority_change: 'bg-orange-100 text-orange-600',
                        email_reply: 'bg-blue-100 text-blue-600',
                      }
                      const desc = log.action === 'ticket_created' ? `Ticket created — ${details.venue_name || ''} — ${details.priority || ''} priority`
                        : log.action === 'ticket_status_change' ? `Status changed: ${details.old_status} → ${details.new_status}`
                        : log.action === 'ticket_assigned' ? `Assigned to ${details.assigned_to}`
                        : log.action === 'ticket_category_change' ? `Category changed to ${details.new_category}`
                        : log.action === 'ticket_priority_change' ? `Priority changed to ${details.new_priority}`
                        : 'Updated'
                      const time = new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                      const color = actionColors[log.action] || 'bg-zinc-100 text-zinc-500'
                      return (
                        <div key={`a-${idx}`} className="px-5 py-3.5 border-b border-[#E8E8E8] last:border-b-0 flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${color}`}>
                            {actionIcons[log.action] || '📝'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-zinc-700">{desc}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 flex-shrink-0">{time}</span>
                        </div>
                      )
                    }
                  })}
                </div>
              )}

              {/* Comment composer */}
              <div className="px-5 py-4 bg-zinc-50/80 border-t border-[#E8E8E8]">
                <form onSubmit={addComment}>
                  {showCanned && cannedResponses.length > 0 && (
                    <div className="mb-3 border border-[#E8E8E8] rounded-lg bg-white divide-y divide-[#E8E8E8] max-h-48 overflow-y-auto shadow-sm">
                      {cannedResponses.map(cr => (
                        <button key={cr.id} type="button"
                          onClick={() => { setNewComment(cr.body); setIsInternal(false); setShowCanned(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                          <p className="text-xs font-semibold text-zinc-900">{cr.title}</p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{cr.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder={isInternal ? 'Add an internal note...' : 'Add a client-visible comment...'}
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none shadow-sm ${isInternal ? 'border-amber-300 bg-amber-50/30 focus:ring-amber-400/40' : 'border-[#E8E8E8] bg-white focus:ring-[#0A52EF]/30'}`}
                    rows={3} />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
                    <div className="inline-flex bg-white border border-[#E8E8E8] rounded-lg overflow-hidden shadow-sm">
                      <button type="button" onClick={() => setShowCanned(!showCanned)}
                        className={`text-xs font-medium px-3 py-2 transition-colors border-r border-[#E8E8E8] ${showCanned ? 'bg-violet-500 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                        Quick Replies
                      </button>
                      <button type="button" onClick={() => setIsInternal(false)}
                        className={`text-xs font-medium px-3 py-2 transition-colors border-r border-[#E8E8E8] ${!isInternal ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                        Client-visible
                      </button>
                      <button type="button" onClick={() => setIsInternal(true)}
                        className={`text-xs font-medium px-3 py-2 transition-colors ${isInternal ? 'bg-amber-500 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                        Internal only
                      </button>
                    </div>
                    <button type="submit" disabled={submitting || !newComment.trim()}
                      className="bg-[#0A52EF] text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-[#0840C0] disabled:opacity-40 transition-colors shadow-sm">
                      {submitting ? 'Posting...' : 'Post Comment'}
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
