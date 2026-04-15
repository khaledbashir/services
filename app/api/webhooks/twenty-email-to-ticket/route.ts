import { NextRequest, NextResponse } from 'next/server'

const TWENTY_BASE = 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_TOKEN = process.env.TWENTY_API_TOKEN || ''
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
const SUPPORT_MAILBOX = 'support@anc.com'

type ParticipantRole = 'FROM' | 'TO' | 'CC' | 'BCC'
interface Participant {
  role: ParticipantRole
  handle: string | null
  displayName: string | null
}

async function tw(method: string, path: string, body?: unknown) {
  const r = await fetch(`${TWENTY_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TWENTY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Twenty ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`${TWENTY_BASE}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TWENTY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await r.json()
  if (json.errors) throw new Error(`Twenty GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.data as T
}

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}

/**
 * Convert plain text → TipTap doc (Twenty's native rich-text format).
 * Splits on blank lines into paragraphs, hard-break inside paragraphs.
 */
function textToTipTap(text: string): string {
  const trimmed = (text || '').trim().slice(0, 8000)
  if (!trimmed) return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
  const paragraphs = trimmed.split(/\n{2,}/)
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((p) => {
      const lines = p.split('\n')
      const content: any[] = []
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
      return { type: 'paragraph', content }
    }),
  })
}

/**
 * Twenty workflow trigger sends us the message after a `message.created` event.
 * We look at the message's thread:
 *   - If thread already has a linked serviceTicket → add a ticketComment
 *   - Else → create a new serviceTicket + link the thread back to it
 *
 * Filtering (must be in support@anc.com inbox + INCOMING) is done by the
 * workflow filter step before this is called, so we trust the payload.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'auth' }, { status: 401 })
  }
  if (!TWENTY_TOKEN) {
    return NextResponse.json({ error: 'TWENTY_API_TOKEN not set' }, { status: 500 })
  }

  try {
    const { messageId } = await request.json()
    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 })
    }

    // 1. Fetch the message + its thread + participants
    const data = await gql<{ message: any }>(
      `query($id: UUID!){
        message(filter:{id:{eq:$id}}){
          id subject text receivedAt direction
          messageThreadId
          messageParticipants{edges{node{role handle displayName}}}
        }
      }`,
      { id: messageId }
    )
    const msg = data.message
    if (!msg) {
      return NextResponse.json({ error: 'message not found', messageId }, { status: 404 })
    }
    if (msg.direction !== 'INCOMING') {
      return NextResponse.json({ skipped: true, reason: 'not INCOMING' })
    }

    const participants: Participant[] = (msg.messageParticipants?.edges ?? []).map(
      (e: any) => e.node
    )
    const recipients = participants
      .filter((p) => p.role === 'TO' || p.role === 'CC')
      .map((p) => (p.handle || '').toLowerCase())
    if (!recipients.some((h) => h.includes(SUPPORT_MAILBOX))) {
      return NextResponse.json({ skipped: true, reason: `${SUPPORT_MAILBOX} not a recipient` })
    }

    const sender = participants.find((p) => p.role === 'FROM')
    const senderEmail = sender?.handle || ''
    const senderName = sender?.displayName || senderEmail.split('@')[0] || 'Unknown'

    // 2. Look up the thread to see if it's already linked to a ticket
    const threadData = await gql<{ messageThread: any }>(
      `query($id: UUID!){
        messageThread(filter:{id:{eq:$id}}){
          id messageThreadServiceTicketId
        }
      }`,
      { id: msg.messageThreadId }
    )
    const thread = threadData.messageThread
    const linkedTicketId = thread?.messageThreadServiceTicketId

    // 3a. Reply path — add a comment to the existing ticket
    if (linkedTicketId) {
      const tipTapBody = textToTipTap(msg.text || '')
      const comment = await tw('POST', '/rest/ticketComments', {
        name: `Reply from ${senderName}`,
        body: { blocknote: tipTapBody, markdown: (msg.text || '').slice(0, 5000) },
        commentType: 'CLIENT_VISIBLE',
        isInternal: false,
        authorName: `${senderName} <${senderEmail}>`,
        serviceTicketId: linkedTicketId,
      }).catch((e) => ({ error: String(e) }))
      return NextResponse.json({
        action: 'comment_created',
        ticketId: linkedTicketId,
        comment,
      })
    }

    // 3b. New ticket path — create + link thread
    const subject = (msg.subject || '(no subject)').slice(0, 250)
    const ticketResp = await tw('POST', '/rest/serviceTickets', {
      name: subject,
      title: subject,
      description: (msg.text || '').slice(0, 5000),
      ticketSource: 'EMAIL',
      ticketStatus: 'TICKET_NEW',
      dateReported: (msg.receivedAt || new Date().toISOString()).slice(0, 10),
      submitterName: senderName,
      // Twenty rejects unknown enum values gracefully — these match the live schema:
      priority: 'PRIORITY_MEDIUM',
      category: 'CAT_OTHER',
    })
    const newTicket = ticketResp?.data?.createServiceTicket
    if (!newTicket?.id) {
      return NextResponse.json(
        { error: 'serviceTicket create returned no id', raw: ticketResp },
        { status: 500 }
      )
    }

    // Link the thread → ticket so future replies become comments
    await gql(
      `mutation($id: UUID!, $ticketId: UUID!){
        updateMessageThread(id:$id, data:{messageThreadServiceTicketId:$ticketId}){id}
      }`,
      { id: msg.messageThreadId, ticketId: newTicket.id }
    ).catch((e) => console.error('[email-to-ticket] thread link failed:', e))

    return NextResponse.json({
      action: 'ticket_created',
      ticketId: newTicket.id,
      threadId: msg.messageThreadId,
      subject,
      from: senderEmail,
    })
  } catch (err) {
    console.error('[email-to-ticket] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unexpected' },
      { status: 500 }
    )
  }
}
