'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ticketCategoryLabel } from '@/lib/ticket-categories'

interface TicketDetail {
  id: string
  ticket_number: number
  title: string
  description: string | null
  category: string | null
  subcategory: string | null
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
  source_label: 'Email response' | 'Ticket Update'
}

interface Attachment {
  id: string
  comment_id: string | null
  filename: string | null
  mime_type: string
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function AttachmentLink({ attachment }: { attachment: Attachment }) {
  if (attachment.mime_type?.startsWith('image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachment.image_url}
        alt={attachment.caption || attachment.filename || 'Attachment'}
        className="mt-3 max-h-64 rounded"
        style={{ border: '1px solid var(--cp-line-strong)' }}
      />
    )
  }
  return (
    <a
      href={attachment.image_url}
      download={attachment.filename || 'attachment'}
      className="mt-3 flex items-center justify-between gap-3 rounded px-3 py-2 text-sm"
      style={{ border: '1px solid var(--cp-line-strong)', color: 'var(--anc-brand)' }}
    >
      <span className="truncate">{attachment.filename || attachment.mime_type || 'Attachment'}</span>
      <span className="text-xs" style={{ color: 'var(--anc-muted)' }}>Download</span>
    </a>
  )
}

export function CustomerTicketConversation({
  ticketId,
  embedded = false,
  onClose,
  onUpdated,
}: {
  ticketId: string
  embedded?: boolean
  onClose?: () => void
  onUpdated?: () => void
}) {
  const router = useRouter()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [notFound, setNotFound] = useState(false)
  const [reply, setReply] = useState('')
  const [replyAttachment, setReplyAttachment] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    setNotFound(false)
    try {
      const response = await fetch(`/api/customer/ticket-conversations/${ticketId}`)
      if (response.status === 401) {
        router.push('/customer/login')
        return
      }
      if (response.status === 404) {
        setTicket(null)
        setNotFound(true)
        return
      }
      if (!response.ok) throw new Error(`Conversation request failed (${response.status})`)
      const data = await response.json()
      setTicket(data.ticket)
      setComments(data.comments || [])
      setAttachments(data.attachments || [])
    } catch (loadError) {
      console.error('Failed to load customer ticket conversation:', loadError)
      setError('This request could not be loaded.')
    }
  }, [router, ticketId])

  useEffect(() => {
    setTicket(null)
    void load()
  }, [load])

  async function sendReply(event: React.FormEvent) {
    event.preventDefault()
    if (!reply.trim() && !replyAttachment) return
    setSending(true)
    setError('')
    try {
      const response = await fetch(`/api/customer/tickets/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply, attachment: replyAttachment, caption: reply }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Your reply could not be sent.')
        return
      }
      setReply('')
      setReplyAttachment(null)
      await load()
      onUpdated?.()
    } catch (sendError) {
      console.error('Failed to send customer ticket reply:', sendError)
      setError('Your reply could not be sent.')
    } finally {
      setSending(false)
    }
  }

  async function readAttachment(file: File) {
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setReplyAttachment({ data, mimeType: file.type || 'application/octet-stream', name: file.name })
    } catch (attachmentError) {
      console.error('Failed to read customer reply attachment:', attachmentError)
      setError('The selected attachment could not be read.')
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-64 items-center justify-center p-8 text-center">
        <div>
          <div className="cp-mono mb-4 text-sm" style={{ color: 'var(--cp-dim)' }}>Request not found</div>
          {embedded ? (
            <button type="button" onClick={onClose} className="cp-btn-ghost">Close</button>
          ) : (
            <Link href="/customer/requests" className="cp-btn-ghost inline-block">← All requests</Link>
          )}
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="flex min-h-64 items-center justify-center p-8">
        <div className="cp-mono text-sm" style={{ color: 'var(--cp-dim)' }}>{error || 'Loading…'}</div>
      </div>
    )
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const standaloneAttachments = attachments.filter((attachment) => !attachment.comment_id)

  return (
    <div className={embedded ? 'min-h-full bg-[var(--anc-page)]' : ''}>
      {embedded && (
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3"
          style={{ borderColor: 'var(--anc-border)' }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--anc-muted)' }}>Request detail</div>
            <div className="mt-0.5 text-sm font-semibold">#{String(ticket.ticket_number).padStart(8, '0')}</div>
          </div>
          <button type="button" onClick={onClose} className="cp-btn-ghost px-3 py-1.5">Close</button>
        </div>
      )}

      <main className={embedded ? 'max-w-none p-5 sm:p-7' : 'mx-auto max-w-3xl'}>
        {!embedded && <Link href="/customer/requests" className="cp-link-sm mb-4 inline-block">← All requests</Link>}
        <div className="cp-panel cp-stagger mb-8 p-7">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className={`cp-led ${ledClass(ticket.status)}`} />
            <span className="cp-status-text" style={{ color: statusColor(ticket.status) }}>
              {ticket.status.replace(/_/g, ' ')}
            </span>
            <span className="cp-mono text-xs" style={{ color: 'var(--cp-dim)' }}>
              #{String(ticket.ticket_number).padStart(8, '0')}
            </span>
            <span className={`cp-chip p-${['urgent', 'high', 'medium', 'low'].includes(ticket.priority) ? ticket.priority : 'low'}`}>
              {ticket.priority}
            </span>
          </div>
          <h1 className="cp-display text-3xl font-bold leading-tight">{ticket.title}</h1>
          <div className="cp-mono mt-2" style={{ fontSize: 11, color: 'var(--cp-dim)' }}>
            {ticket.venue_name} · {ticketCategoryLabel(ticket.category)}
            {ticket.subcategory ? ` — ${ticket.subcategory}` : ''} · Opened {formatDateTime(ticket.created_at)}
          </div>
          {ticket.description && (
            <p className="mt-5 whitespace-pre-wrap text-sm" style={{ color: 'var(--cp-muted)', lineHeight: 1.7 }}>
              {ticket.description}
            </p>
          )}
          {ticket.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.image_url} alt="Ticket attachment" className="mt-5 max-h-80 rounded" style={{ border: '1px solid var(--cp-line-strong)' }} />
          )}
          {standaloneAttachments.map((attachment) => (
            <AttachmentLink key={attachment.id} attachment={attachment} />
          ))}
          {isClosed && ticket.resolution_notes && (
            <div className="cp-resolution mt-6">
              <div className="cp-mono mb-2" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--cp-green)' }}>Resolution</div>
              <p className="whitespace-pre-wrap text-sm" style={{ lineHeight: 1.7 }}>{ticket.resolution_notes}</p>
            </div>
          )}
        </div>

        <div className="cp-divider-label mb-5">
          Conversation{comments.length > 0 && ` — ${comments.length}`}
        </div>
        <div className="cp-stagger mb-8 space-y-4">
          {comments.length === 0 && (
            <div className="cp-panel cp-mono p-5 text-xs" style={{ color: 'var(--cp-dim)' }}>No replies yet</div>
          )}
          {comments.map((comment) => {
            const commentAttachments = attachments.filter((attachment) => attachment.comment_id === comment.id)
            const isEmailResponse = comment.source_label === 'Email response'
            return (
              <div key={comment.id} className={`cp-msg ${comment.is_customer ? 'is-customer' : 'is-anc'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="cp-msg-author" style={{ color: comment.is_customer ? 'var(--cp-blue-bright)' : 'var(--cp-green)' }}>
                    {comment.author}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: isEmailResponse ? 'var(--cp-violet)' : 'var(--anc-brand)',
                      background: isEmailResponse ? 'rgba(124, 58, 237, 0.1)' : 'var(--anc-brand-light)',
                    }}
                  >
                    {comment.source_label}
                  </span>
                  <span className="cp-mono ml-auto" style={{ fontSize: 10, color: 'var(--cp-dim)' }}>
                    {formatDateTime(comment.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm" style={{ lineHeight: 1.65 }}>{comment.body}</p>
                {commentAttachments.map((attachment) => (
                  <AttachmentLink key={attachment.id} attachment={attachment} />
                ))}
              </div>
            )
          })}
        </div>

        <form onSubmit={sendReply} className="cp-panel p-5">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            placeholder={isClosed ? 'This request is closed — reply to reopen the conversation.' : 'Write a reply…'}
            className="cp-input"
          />
          <div className="mt-3">
            <label className="cp-label">Attach photo or file</label>
            <input
              type="file"
              className="cp-input"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void readAttachment(file)
                else setReplyAttachment(null)
              }}
            />
            {replyAttachment && (
              <div className="mt-2 text-xs" style={{ color: 'var(--anc-muted)' }}>
                Attached: {replyAttachment.name}
              </div>
            )}
          </div>
          {error && <div className="cp-error mt-3">{error}</div>}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={sending || (!reply.trim() && !replyAttachment)} className="cp-btn">
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
