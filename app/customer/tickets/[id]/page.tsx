'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PortalShell from '../../PortalShell'

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

function ledClass(status: string) {
  if (status === 'new' || status === 'open') return 'is-open'
  if (status === 'in_progress') return 'is-work'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'is-wait'
  if (status === 'resolved') return 'is-done'
  return 'is-closed'
}

function statusColor(status: string) {
  if (status === 'new' || status === 'open') return 'var(--cp-blue-bright)'
  if (status === 'in_progress') return 'var(--cp-amber)'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'var(--cp-violet)'
  if (status === 'resolved') return 'var(--cp-green)'
  return 'var(--cp-dim)'
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function TicketContent() {
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
      <div className="cp-auth-shell">
        <div className="text-center">
          <div className="cp-mono text-sm mb-4" style={{ color: 'var(--cp-dim)' }}>Ticket not found</div>
          <Link href="/customer" className="cp-btn-ghost inline-block">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="cp-auth-shell">
        <div className="cp-mono text-sm" style={{ color: 'var(--cp-dim)' }}>Loading…</div>
      </div>
    )
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const standaloneAttachments = attachments.filter(a => !a.comment_id)

  return (
    <div>
      <main className="max-w-3xl mx-auto">
        <Link href="/customer/requests" className="cp-link-sm inline-block mb-4">← All requests</Link>
        <div className="cp-panel p-7 mb-8 cp-stagger">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className={`cp-led ${ledClass(ticket.status)}`} />
            <span className="cp-status-text" style={{ color: statusColor(ticket.status) }}>
              {ticket.status.replace(/_/g, ' ')}
            </span>
            <span className="cp-mono text-xs" style={{ color: 'var(--cp-dim)' }}>
              #{String(ticket.ticket_number).padStart(8, '0')}
            </span>
            <span className={`cp-chip p-${['urgent','high','medium','low'].includes(ticket.priority) ? ticket.priority : 'low'}`}>
              {ticket.priority}
            </span>
          </div>
          <h1 className="cp-display text-3xl font-bold leading-tight">
            {ticket.title}
          </h1>
          <div className="cp-mono mt-2" style={{ fontSize: 11, color: 'var(--cp-dim)' }}>
            {ticket.venue_name} · Opened {fmtDateTime(ticket.created_at)}
          </div>
          {ticket.description && (
            <p className="text-sm mt-5 whitespace-pre-wrap" style={{ color: 'var(--cp-muted)', lineHeight: 1.7 }}>
              {ticket.description}
            </p>
          )}
          {ticket.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.image_url} alt="Ticket attachment" className="mt-5 rounded max-h-80" style={{ border: '1px solid var(--cp-line-strong)' }} />
          )}
          {standaloneAttachments.map(a => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={a.image_url} alt={a.caption || a.filename || 'Attachment'} className="mt-4 rounded max-h-80" style={{ border: '1px solid var(--cp-line-strong)' }} />
          ))}
          {isClosed && ticket.resolution_notes && (
            <div className="cp-resolution mt-6">
              <div className="cp-mono mb-2" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--cp-green)' }}>Resolution</div>
              <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: 1.7 }}>{ticket.resolution_notes}</p>
            </div>
          )}
        </div>

        <div className="cp-divider-label mb-5">
          Conversation{comments.length > 0 && ` — ${comments.length}`}
        </div>

        <div className="space-y-4 mb-8 cp-stagger">
          {comments.length === 0 && (
            <div className="cp-panel p-5 cp-mono text-xs" style={{ color: 'var(--cp-dim)' }}>No replies yet</div>
          )}
          {comments.map(c => {
            const commentAttachments = attachments.filter(a => a.comment_id === c.id)
            return (
              <div key={c.id} className={`cp-msg ${c.is_customer ? 'is-customer' : 'is-anc'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="cp-msg-author" style={{ color: c.is_customer ? 'var(--cp-blue-bright)' : 'var(--cp-green)' }}>
                    {c.author}
                  </span>
                  <span className="cp-mono" style={{ fontSize: 10, color: 'var(--cp-dim)' }}>
                    {fmtDateTime(c.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: 1.65 }}>{c.body}</p>
                {commentAttachments.map(a => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.image_url} alt={a.caption || 'Attachment'} className="mt-3 rounded max-h-64" style={{ border: '1px solid var(--cp-line-strong)' }} />
                ))}
              </div>
            )
          })}
        </div>

        <form onSubmit={sendReply} className="cp-panel p-5">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder={isClosed ? 'This request is closed — reply to reopen the conversation.' : 'Write a reply…'}
            className="cp-input"
          />
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={sending || !reply.trim()} className="cp-btn">
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default function CustomerTicketPage() {
  return (
    <PortalShell active="Requests">
      <TicketContent />
    </PortalShell>
  )
}
