'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface TicketDetail {
  id: string
  ticket_number: number
  title: string
  description: string | null
  category: string | null
  priority: string
  status: string
  resolution_notes: string | null
  image_url: string | null
  created_at: string
  resolved_at: string | null
  venue_name: string
}

interface Comment {
  id: string
  body: string
  created_at: string
  author: string
  is_customer: boolean
}

interface Attachment {
  id: string
  comment_id: string | null
  filename: string | null
  image_url: string
  caption: string | null
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting: 'bg-purple-100 text-purple-700',
  on_hold: 'bg-slate-100 text-slate-600',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function CustomerTicketPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [notFound, setNotFound] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/customer/tickets/${params.id}`)
    if (res.status === 401) { router.push('/customer/login'); return }
    if (res.status === 404) { setNotFound(true); return }
    const data = await res.json()
    setTicket(data.ticket)
    setComments(data.comments || [])
    setAttachments(data.attachments || [])
  }, [params.id, router])

  useEffect(() => { load() }, [load])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/customer/tickets/${params.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply }),
      })
      if (res.ok) {
        setReply('')
        load()
      }
    } finally {
      setSending(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400 mb-3">Ticket not found</div>
          <Link href="/customer" className="text-[#0A52EF] text-sm font-medium">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading…</div>
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const standaloneAttachments = attachments.filter(a => !a.comment_id)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#1B2A4A] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7" />
          <Link href="/customer" className="text-sm text-blue-200 hover:text-white transition">← All tickets</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs font-mono text-slate-400">#{String(ticket.ticket_number).padStart(8, '0')}</span>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status] || 'bg-slate-100 text-slate-600'}`}>
              {ticket.status.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-slate-400">{ticket.venue_name}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{ticket.title}</h1>
          <div className="text-xs text-slate-500 mt-1">Opened {fmtDateTime(ticket.created_at)}</div>
          {ticket.description && (
            <p className="text-sm text-slate-700 mt-4 whitespace-pre-wrap">{ticket.description}</p>
          )}
          {ticket.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.image_url} alt="Ticket attachment" className="mt-4 rounded-lg border border-slate-200 max-h-80" />
          )}
          {standaloneAttachments.map(a => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={a.image_url} alt={a.caption || a.filename || 'Attachment'} className="mt-3 rounded-lg border border-slate-200 max-h-80" />
          ))}
          {isClosed && ticket.resolution_notes && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3">
              <div className="text-xs font-semibold text-green-800 mb-1">Resolution</div>
              <p className="text-sm text-green-900 whitespace-pre-wrap">{ticket.resolution_notes}</p>
            </div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Conversation {comments.length > 0 && `(${comments.length})`}
        </h2>
        <div className="space-y-3 mb-6">
          {comments.length === 0 && (
            <div className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4">No replies yet.</div>
          )}
          {comments.map(c => {
            const commentAttachments = attachments.filter(a => a.comment_id === c.id)
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-4 ${c.is_customer ? 'bg-blue-50/60 border-blue-200 ml-6' : 'bg-white border-slate-200 mr-6'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                  <span className="text-xs text-slate-400">{fmtDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.body}</p>
                {commentAttachments.map(a => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.image_url} alt={a.caption || 'Attachment'} className="mt-2 rounded-lg border border-slate-200 max-h-64" />
                ))}
              </div>
            )
          })}
        </div>

        <form onSubmit={sendReply} className="bg-white rounded-xl border border-slate-200 p-4">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder={isClosed ? 'This ticket is closed — reply to reopen the conversation.' : 'Write a reply…'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
          />
          <div className="flex justify-end mt-3">
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
