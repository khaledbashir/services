'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import Link from 'next/link'

interface TicketDetail {
  id: string
  ticket_number: number
  title: string
  description: string
  priority: string
  status: string
  category: string
  resolution_notes: string | null
  event_id: string | null
  event_name: string | null
  venue_name: string
  venue_id: string
  created_by_name: string
  assigned_to_name: string | null
  assigned_to: string | null
  created_date: string
  updated_date: string
  resolved_date: string | null
}

interface Comment {
  id: string
  body: string
  is_internal: boolean
  author_name: string
  created_date: string
}

interface Activity {
  action: string
  staff_id: string | null
  details: any
  created_at: string
}

interface Staff {
  id: string
  full_name: string
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  hardware: { bg: 'bg-red-50', text: 'text-red-600' },
  software: { bg: 'bg-violet-50', text: 'text-violet-600' },
  content: { bg: 'bg-amber-50', text: 'text-amber-600' },
  operational: { bg: 'bg-blue-50', text: 'text-blue-600' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-zinc-50', text: 'text-zinc-600' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-600' },
  high: { bg: 'bg-orange-50', text: 'text-orange-600' },
  critical: { bg: 'bg-red-50', text: 'text-red-600' },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-red-50', text: 'text-red-600' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-600' },
  resolved: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  closed: { bg: 'bg-zinc-50', text: 'text-zinc-500' },
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
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [params.id])

  const handleUpdateField = async (field: string, value: any) => {
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) {
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tickets/${params.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment, is_internal: isInternal })
      })
      if (res.ok) {
        setNewComment('')
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveResolution = async () => {
    await handleUpdateField('resolution_notes', resolutionNotes)
    setEditResolution(false)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-zinc-500">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!ticket) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded border border-[#E8E8E8] p-8 text-center">
          <p className="text-zinc-500">Ticket not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded border border-[#E8E8E8] p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">
                #{ticket.ticket_number} • {ticket.title}
              </h1>
              <p className="text-sm text-zinc-500 mt-1">{ticket.description}</p>
            </div>
            <button
              onClick={() => router.back()}
              className="text-zinc-500 hover:text-zinc-700 text-sm"
            >
              ← Back
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-1 rounded ${categoryColors[ticket.category]?.bg} ${categoryColors[ticket.category]?.text}`}>
              {ticket.category}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded ${priorityColors[ticket.priority]?.bg} ${priorityColors[ticket.priority]?.text}`}>
              {ticket.priority}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded ${statusColors[ticket.status]?.bg} ${statusColors[ticket.status]?.text}`}>
              {ticket.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="col-span-2 space-y-6">
            {/* Info Grid */}
            <div className="bg-white rounded border border-[#E8E8E8] p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Venue</p>
                  <p className="text-zinc-900">{ticket.venue_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Event</p>
                  {ticket.event_id ? (
                    <Link href={`/events/${ticket.event_id}`} className="text-[#0A52EF] hover:underline">
                      {ticket.event_name}
                    </Link>
                  ) : (
                    <p className="text-zinc-500">-</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Created By</p>
                  <p className="text-zinc-900">{ticket.created_by_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Created</p>
                  <p className="text-zinc-900">{ticket.created_date}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Updated</p>
                  <p className="text-zinc-900">{ticket.updated_date}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Resolved</p>
                  <p className="text-zinc-900">{ticket.resolved_date || '-'}</p>
                </div>
              </div>
            </div>

            {/* Status & Assignment Controls */}
            <div className="bg-white rounded border border-[#E8E8E8] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900">Update</h3>
              
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Status</label>
                <select
                  value={ticket.status}
                  onChange={e => handleUpdateField('status', e.target.value)}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Priority</label>
                <select
                  value={ticket.priority}
                  onChange={e => handleUpdateField('priority', e.target.value)}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Category</label>
                <select
                  value={ticket.category}
                  onChange={e => handleUpdateField('category', e.target.value)}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                >
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                  <option value="content">Content</option>
                  <option value="operational">Operational</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Assign To</label>
                <select
                  value={ticket.assigned_to || ''}
                  onChange={e => handleUpdateField('assigned_to', e.target.value || null)}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            </div>

            {/* Resolution Notes */}
            {(ticket.status === 'resolved' || ticket.status === 'closed') && (
              <div className="bg-white rounded border border-[#E8E8E8] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-zinc-900">Resolution Notes</h3>
                  {!editResolution && (
                    <button
                      onClick={() => setEditResolution(true)}
                      className="text-xs text-[#0A52EF] hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editResolution ? (
                  <div className="space-y-2">
                    <textarea
                      value={resolutionNotes}
                      onChange={e => setResolutionNotes(e.target.value)}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveResolution}
                        className="bg-[#0A52EF] text-white px-3 py-1 rounded text-xs font-medium hover:bg-[#0840C0]"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditResolution(false)}
                        className="border border-[#E8E8E8] text-zinc-600 px-3 py-1 rounded text-xs font-medium hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600">{resolutionNotes || 'No notes yet'}</p>
                )}
              </div>
            )}

            {/* Status Change History */}
            {activity.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-4">Status Change History</h3>
                <div className="space-y-3 text-sm">
                  {activity.map((log, idx) => {
                    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                    const action = log.action === 'ticket_status_change'
                      ? `Status changed from ${details.old_status} to ${details.new_status}`
                      : log.action === 'ticket_assigned'
                      ? `Assigned to ${details.assigned_to}`
                      : log.action === 'ticket_category_change'
                      ? `Category changed from ${details.old_category} to ${details.new_category}`
                      : 'Updated'
                    
                    const date = new Date(log.created_at)
                    const timeStr = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                    
                    return (
                      <div key={idx} className="flex gap-3 text-zinc-600">
                        <span className="text-zinc-400">•</span>
                        <span>{action} — {timeStr}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="bg-white rounded border border-[#E8E8E8] p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Comments</h3>
              
              <form onSubmit={handleAddComment} className="mb-6 pb-6 border-b border-[#E8E8E8]">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none mb-2"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={e => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal only
                  </label>
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    className="ml-auto bg-[#0A52EF] text-white px-3 py-1 rounded text-xs font-medium hover:bg-[#0840C0] disabled:opacity-50"
                  >
                    {submitting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </form>

              {comments.length === 0 ? (
                <p className="text-xs text-zinc-500">No comments yet</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="border-b border-[#E8E8E8] pb-4 last:border-b-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-xs font-semibold text-zinc-900">{comment.author_name}</p>
                        {comment.is_internal && (
                          <span className="text-xs bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">Internal</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mb-1">{comment.created_date}</p>
                      <p className="text-sm text-zinc-700">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded border border-[#E8E8E8] p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Assigned To</h3>
              <p className="text-sm text-zinc-900">
                {ticket.assigned_to_name || <span className="text-zinc-500">Unassigned</span>}
              </p>
            </div>

            <div className="bg-white rounded border border-[#E8E8E8] p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Info</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Status</p>
                  <span className={`text-xs font-medium px-2 py-1 rounded inline-block ${statusColors[ticket.status]?.bg} ${statusColors[ticket.status]?.text}`}>
                    {ticket.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Priority</p>
                  <span className={`text-xs font-medium px-2 py-1 rounded inline-block ${priorityColors[ticket.priority]?.bg} ${priorityColors[ticket.priority]?.text}`}>
                    {ticket.priority}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Category</p>
                  <span className={`text-xs font-medium px-2 py-1 rounded inline-block ${categoryColors[ticket.category]?.bg} ${categoryColors[ticket.category]?.text}`}>
                    {ticket.category}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
