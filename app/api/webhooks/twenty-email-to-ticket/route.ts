import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const TWENTY_BASE = 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_TOKEN = process.env.TWENTY_API_TOKEN || ''
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
const SUPPORT_MAILBOX = 'support@anc.com'
const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}

function parseCaseNumber(subject: string | null | undefined): number | null {
  const match = (subject || '').match(/\bCase\s*#?\s*0*(\d+)\b/i)
  return match ? Number(match[1]) : null
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

async function findVenueForSender(senderEmail: string): Promise<{ id: string; name: string } | null> {
  const normalizedEmail = senderEmail.toLowerCase().trim()
  if (!normalizedEmail) return null

  const exact = await query(
    `SELECT id, name FROM venues
     WHERE primary_contact_email ILIKE $1
        OR $2 = ANY(COALESCE(distribution_emails, '{}'))
     LIMIT 1`,
    [normalizedEmail, normalizedEmail]
  )
  if (exact.rows[0]) return exact.rows[0]

  const domain = normalizedEmail.split('@')[1] || ''
  const genericDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com', 'anc.com']
  if (!domain || genericDomains.includes(domain)) return null

  const domainMatch = await query(
    `SELECT id, name FROM venues
     WHERE primary_contact_email ILIKE $1
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(distribution_emails, '{}')) AS e WHERE e ILIKE $1)
     LIMIT 1`,
    [`%@${domain}`]
  )
  return domainMatch.rows[0] || null
}

async function createDashboardTicketFromEmail(params: {
  twentyTicketId: string
  subject: string
  body: string
  senderName: string
  senderEmail: string
  receivedAt?: string | null
}) {
  const existing = await query('SELECT id, ticket_number FROM tickets WHERE twenty_ticket_id = $1 LIMIT 1', [params.twentyTicketId])
  if (existing.rows[0]) return existing.rows[0]

  const venue = await findVenueForSender(params.senderEmail)
  const description = params.body
    ? `Email from ${params.senderName} (${params.senderEmail}):\n\n${params.body.slice(0, 5000)}`
    : `Email received from ${params.senderName} (${params.senderEmail}). Subject: ${params.subject}`

  const result = await query(
    `INSERT INTO tickets (
       venue_id, title, description, category, priority, status, created_by,
       original_message, source, contact_name, contact_email, twenty_ticket_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, 'general', 'medium', 'new', $4, $5, 'email', $6, $7, $8,
       COALESCE($9::timestamp, NOW()), COALESCE($9::timestamp, NOW()))
     RETURNING id, ticket_number`,
    [
      venue?.id || null,
      params.subject.slice(0, 100),
      description,
      CLAW_STAFF_ID,
      params.body || params.subject,
      params.senderName,
      params.senderEmail,
      params.twentyTicketId,
      params.receivedAt || null,
    ]
  )
  return result.rows[0]
}

async function addDashboardEmailComment(params: {
  twentyTicketId: string
  body: string
  senderName: string
  senderEmail: string
  twentyMessageId: string
}): Promise<{ status: 'inserted' | 'duplicate' | 'no_ticket' | 'empty'; comment: { id: string } | null }> {
  if (!params.body.trim()) return { status: 'empty', comment: null }

  const ticket = await query(
    `SELECT id FROM tickets WHERE twenty_ticket_id = $1 LIMIT 1`,
    [params.twentyTicketId]
  )
  const localTicket = ticket.rows[0]
  if (!localTicket) return { status: 'no_ticket', comment: null }

  const commentBody = `Email from ${params.senderName} (${params.senderEmail}):\n\n${params.body.slice(0, 5000)}`
  const comment = await query(
    `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, twenty_message_id, created_at)
     VALUES ($1, $2, $3, false, $4, NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [localTicket.id, CLAW_STAFF_ID, commentBody, params.twentyMessageId]
  )
  await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [localTicket.id])
  if (!comment.rows[0]) return { status: 'duplicate', comment: null }
  return { status: 'inserted', comment: comment.rows[0] }
}

async function addTwentyEmailReplyToDashboardTicket(params: {
  ticketNumber: number
  body: string
  senderName: string
  senderEmail: string
  twentyMessageId: string
}) {
  const ticket = await query(
    `SELECT id, twenty_ticket_id FROM tickets WHERE ticket_number = $1 LIMIT 1`,
    [params.ticketNumber],
  )
  const localTicket = ticket.rows[0]
  if (!localTicket || !params.body.trim()) return null

  const commentBody = `Email from ${params.senderName} (${params.senderEmail}):\n\n${params.body.slice(0, 5000)}`
  const comment = await query(
    `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, twenty_message_id, created_at)
     VALUES ($1, $2, $3, false, $4, NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [localTicket.id, CLAW_STAFF_ID, commentBody, params.twentyMessageId],
  )
  await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [localTicket.id])
  return { comment: comment.rows[0] || null, twentyTicketId: localTicket.twenty_ticket_id || null }
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

    // Twenty's sync is two-stage: the message row exists (subject/participants)
    // before the body text is imported. This trigger fires on message.created,
    // so poll briefly for the text instead of storing the subject-only fallback.
    // The repair-email-tickets cron catches anything that lands even later.
    for (let attempt = 0; attempt < 5 && !(msg.text || '').trim(); attempt++) {
      await sleep(3000)
      const refetch = await gql<{ message: any }>(
        `query($id: UUID!){ message(filter:{id:{eq:$id}}){ text } }`,
        { id: messageId }
      ).catch(() => null)
      if (refetch?.message?.text?.trim()) msg.text = refetch.message.text
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
    const subjectCaseNumber = parseCaseNumber(msg.subject)

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

    // 3a. Services-sent support replies use the visible support@anc.com mailbox.
    // Their client replies may arrive as a fresh CRM thread, so route by Case number.
    if (!linkedTicketId && subjectCaseNumber) {
      const dashboardComment = await addTwentyEmailReplyToDashboardTicket({
        ticketNumber: subjectCaseNumber,
        body: msg.text || '',
        senderName,
        senderEmail,
        twentyMessageId: msg.id,
      }).catch((e) => ({ error: String(e) }))

      // comment === null means the message id was already ingested (duplicate
      // delivery) — don't mirror it to the CRM a second time.
      if (dashboardComment && !('error' in dashboardComment) && dashboardComment.twentyTicketId && dashboardComment.comment) {
        const tipTapBody = textToTipTap(msg.text || '')
        await tw('POST', '/rest/ticketComments', {
          name: `Reply from ${senderName}`,
          body: { blocknote: tipTapBody, markdown: (msg.text || '').slice(0, 5000) },
          commentType: 'CLIENT_VISIBLE',
          isInternal: false,
          authorName: `${senderName} <${senderEmail}>`,
          serviceTicketId: dashboardComment.twentyTicketId,
        }).catch((e) => console.error('[email-to-ticket] subject case CRM comment failed:', e))

        await gql(
          `mutation($id: UUID!, $ticketId: UUID!){
            updateMessageThread(id:$id, data:{messageThreadServiceTicketId:$ticketId}){id}
          }`,
          { id: msg.messageThreadId, ticketId: dashboardComment.twentyTicketId },
        ).catch((e) => console.error('[email-to-ticket] subject case thread link failed:', e))

        return NextResponse.json({
          action: 'comment_created_from_case_subject',
          ticketNumber: subjectCaseNumber,
          ticketId: dashboardComment.twentyTicketId,
          dashboardComment,
        })
      }

      if (dashboardComment && 'error' in dashboardComment) {
        console.warn('[email-to-ticket] subject case dashboard comment failed:', dashboardComment.error)
      }
    }

    // 3a. Reply path — add a comment to the existing ticket. Dashboard insert
    // runs first: it dedupes on twenty_message_id, and a null result means this
    // message was already ingested, so we skip the CRM mirror too.
    if (linkedTicketId) {
      const dashboardComment = await addDashboardEmailComment({
        twentyTicketId: linkedTicketId,
        body: msg.text || '',
        senderName,
        senderEmail,
        twentyMessageId: msg.id,
      }).catch((e) => ({ error: String(e) }))

      let comment: unknown = null
      const isDuplicate = !!dashboardComment && !('error' in dashboardComment) && dashboardComment.status === 'duplicate'
      if (!isDuplicate) {
        const tipTapBody = textToTipTap(msg.text || '')
        comment = await tw('POST', '/rest/ticketComments', {
          name: `Reply from ${senderName}`,
          body: { blocknote: tipTapBody, markdown: (msg.text || '').slice(0, 5000) },
          commentType: 'CLIENT_VISIBLE',
          isInternal: false,
          authorName: `${senderName} <${senderEmail}>`,
          serviceTicketId: linkedTicketId,
        }).catch((e) => ({ error: String(e) }))
      }
      return NextResponse.json({
        action: isDuplicate ? 'comment_duplicate_skipped' : 'comment_created',
        ticketId: linkedTicketId,
        comment,
        dashboardComment,
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

    const dashboardTicket = await createDashboardTicketFromEmail({
      twentyTicketId: newTicket.id,
      subject,
      body: msg.text || '',
      senderName,
      senderEmail,
      receivedAt: msg.receivedAt,
    })
    await tw('PATCH', `/rest/serviceTickets/${newTicket.id}`, {
      servicesId: dashboardTicket.id,
    }).catch((e) => console.error('[email-to-ticket] servicesId backfill failed:', e))

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
      dashboardTicketId: dashboardTicket.id,
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
