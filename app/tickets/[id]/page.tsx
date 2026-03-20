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
  open: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Open' },
  in_progress: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'In Progress' },
  resolved: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Resolved' },
  closed: { dot: 'bg-zinc-400', bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Closed' },
}
const categoryConfig: Record<string, { bg: string; text: string }> = {
  hardware: { bg: 'bg-red-50', text: 'text-red-600' },
  software: { bg: 'bg-violet-50', text: 'text-violet-600' },
  content: { bg: 'bg-amber-50', text: 'text-amber-600' },
  operational: { bg: 'bg-blue-50', text: 'text-blue-600' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

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

  const getInitials = (name: string) => { const p = name.split(' '); return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase() }

  if (loading) return <DashboardLayout><div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>
  if (!ticket) return <DashboardLayout><div className="bg-white rounded border border-[#E8E8E8] p-12 text-center"><p className="text-zinc-500">Ticket not found</p></div></DashboardLayout>

  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
  const st = statusConfig[ticket.status] || statusConfig.open
  const cat = categoryConfig[ticket.category] || categoryConfig.general

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <button onClick={() => router.push('/tickets')} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← Back to Tickets</button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className={`h-1 ${pri.dot}`}></div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-zinc-400">#{ticket.ticket_number}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 ${st.bg} ${st.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>{st.label}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${cat.bg} ${cat.text}`}>{ticket.category}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${pri.bg} ${pri.text}`}>{pri.label}</span>
                </div>
                <h1 className="text-xl font-semibold text-zinc-900">{ticket.title}</h1>
                {ticket.description && <p className="text-sm text-zinc-600 mt-2">{ticket.description}</p>}
                <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
                  <span>Opened by <span className="font-medium text-zinc-700">{ticket.created_by_name}</span></span>
                  <span>•</span>
                  <span>{ticket.created_date}</span>
                  <span>•</span>
                  <Link href={`/venues/${ticket.venue_id}`} className="text-[#0A52EF] hover:underline">{ticket.venue_name}</Link>
                  {ticket.event_name && <><span>•</span><Link href={`/events/${ticket.event_id}`} className="text-[#0A52EF] hover:underline">{ticket.event_name}</Link></>}
                </div>
              </div>
            </div>

            {/* Resolution Notes */}
            {(ticket.status === 'resolved' || ticket.status === 'closed') && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-emerald-900">Resolution</h3>
                  {!editResolution && <button onClick={() => setEditResolution(true)} className="text-xs text-emerald-700 hover:underline">Edit</button>}
                </div>
                {editResolution ? (
                  <div className="space-y-2">
                    <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                      className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white" rows={3} />
                    <div className="flex gap-2">
                      <button onClick={saveResolution} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-emerald-700">Save</button>
                      <button onClick={() => setEditResolution(false)} className="text-xs text-zinc-600 px-3 py-1.5">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-800">{resolutionNotes || 'No resolution notes yet'}</p>
                )}
              </div>
            )}

            {/* Comments */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E8E8]">
                <h2 className="text-sm font-semibold text-zinc-900">Comments ({comments.length})</h2>
              </div>

              {/* Comment composer */}
              <div className="px-6 py-4 border-b border-[#E8E8E8] bg-zinc-50/50">
                <form onSubmit={addComment}>
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={isInternal ? 'Add an internal note (not visible to clients)...' : 'Add a comment (visible to clients)...'}
                    className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none ${isInternal ? 'border-amber-200 bg-amber-50/50 focus:ring-amber-500/30' : 'border-[#E8E8E8] bg-white focus:ring-[#0A52EF]/30'}`}
                    rows={3}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsInternal(false)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${!isInternal ? 'bg-[#0A52EF] text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
                        Client-visible
                      </button>
                      <button type="button" onClick={() => setIsInternal(true)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${isInternal ? 'bg-amber-500 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
                        Internal only
                      </button>
                    </div>
                    <button type="submit" disabled={submitting || !newComment.trim()}
                      className="bg-[#0A52EF] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                      {submitting ? 'Posting...' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Comment thread */}
              {comments.length === 0 ? (
                <div className="px-6 py-8 text-center text-zinc-400 text-sm">No comments yet</div>
              ) : (
                <div className="divide-y divide-[#E8E8E8]">
                  {comments.map(comment => (
                    <div key={comment.id} className={`px-6 py-4 ${comment.is_internal ? 'bg-amber-50/30 border-l-2 border-amber-400' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0A52EF]/10 flex items-center justify-center text-xs font-semibold text-[#0A52EF] flex-shrink-0 mt-0.5">
                          {getInitials(comment.author_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">{comment.author_name}</span>
                            {comment.is_internal && <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Internal</span>}
                            <span className="text-xs text-zinc-400">{comment.created_date}</span>
                          </div>
                          <p className="text-sm text-zinc-700 mt-1 whitespace-pre-wrap">{comment.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity */}
            {activity.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E8E8E8]">
                  <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
                </div>
                <div className="px-6 py-4 space-y-3">
                  {activity.map((log, idx) => {
                    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                    const action = log.action === 'ticket_status_change' ? `Status changed from ${details.old_status} → ${details.new_status}`
                      : log.action === 'ticket_assigned' ? `Assigned to ${details.assigned_to}`
                      : log.action === 'ticket_category_change' ? `Category changed to ${details.new_category}`
                      : log.action === 'ticket_priority_change' ? `Priority changed to ${details.new_priority}`
                      : 'Updated'
                    const time = new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                    return (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-1.5 flex-shrink-0"></div>
                        <div>
                          <span className="text-zinc-700">{action}</span>
                          <span className="text-zinc-400 ml-2">{time}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Owner */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Owner</p>
              {ticket.assigned_to_name ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0A52EF]/10 flex items-center justify-center text-sm font-semibold text-[#0A52EF]">
                    {getInitials(ticket.assigned_to_name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{ticket.assigned_to_name}</p>
                    <p className="text-xs text-zinc-500">Assigned</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Unassigned</p>
              )}
              <select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)}
                className="w-full mt-3 border border-[#E8E8E8] rounded px-3 py-2 text-xs focus:ring-2 focus:ring-[#0A52EF]/30 outline-none text-zinc-700">
                <option value="">Unassigned</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Status</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateField('status', key)}
                    className={`text-xs font-medium px-3 py-2 rounded transition-colors flex items-center gap-1.5 ${ticket.status === key ? `${cfg.bg} ${cfg.text} ring-1 ring-current` : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === key ? cfg.dot : 'bg-zinc-300'}`}></span>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Priority</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(priorityConfig).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateField('priority', key)}
                    className={`text-xs font-medium px-3 py-2 rounded transition-colors flex items-center gap-1.5 ${ticket.priority === key ? `${cfg.bg} ${cfg.text} ring-1 ring-current` : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ticket.priority === key ? cfg.dot : 'bg-zinc-300'}`}></span>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Category</p>
              <div className="space-y-1.5">
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateField('category', key)}
                    className={`w-full text-left text-xs font-medium px-3 py-2 rounded transition-colors capitalize ${ticket.category === key ? `${cfg.bg} ${cfg.text} ring-1 ring-current` : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Details</p>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between"><span className="text-zinc-500">Created</span><span className="text-zinc-900">{ticket.created_date}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Updated</span><span className="text-zinc-900">{ticket.updated_date}</span></div>
                {ticket.resolved_date && <div className="flex justify-between"><span className="text-zinc-500">Resolved</span><span className="text-zinc-900">{ticket.resolved_date}</span></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
