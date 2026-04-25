import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { query } from '@/lib/db'
import { sendTicketReplyEmail } from '@/lib/email'

const TWENTY_BASE = 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_TOKEN = process.env.TWENTY_API_TOKEN || ''

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch {
    return null
  }
}

function textToTipTap(text: string): string {
  const trimmed = (text || '').trim().slice(0, 8000)
  if (!trimmed) return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
  return JSON.stringify({
    type: 'doc',
    content: trimmed.split(/\n{2,}/).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.split('\n').flatMap((line, index) => {
        const content: any[] = []
        if (index > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
        return content
      }),
    })),
  })
}

async function addTwentyVisibleComment(params: {
  ticketId: string
  body: string
  authorName: string
  recipient: string
}) {
  if (!TWENTY_TOKEN) return null
  try {
    const res = await fetch(`${TWENTY_BASE}/rest/ticketComments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TWENTY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Dashboard email to ${params.recipient}`,
        body: {
          blocknote: textToTipTap(params.body),
          markdown: params.body.slice(0, 5000),
        },
        commentType: 'CLIENT_VISIBLE',
        isInternal: false,
        authorName: params.authorName,
        serviceTicketId: params.ticketId,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn(`[twenty] outbound ticket email comment failed ${res.status}: ${text.slice(0, 300)}`)
      return null
    }
    return await res.json().catch(() => null)
  } catch (err) {
    console.warn('[twenty] outbound ticket email comment failed:', err)
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body, to } = await request.json()
    const replyBody = typeof body === 'string' ? body.trim() : ''
    if (!replyBody) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
    }

    const ticketResult = await query(
      `SELECT
         t.id,
         t.ticket_number,
         t.title,
         t.venue_id,
         t.contact_email,
         t.twenty_ticket_id,
         v.name as venue_name,
         v.primary_contact_email
       FROM tickets t
       LEFT JOIN venues v ON v.id = t.venue_id
       WHERE t.id = $1`,
      [params.id]
    )

    const ticket = ticketResult.rows[0]
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const recipient = String(to || ticket.contact_email || ticket.primary_contact_email || '').trim()
    if (!recipient || !recipient.includes('@')) {
      return NextResponse.json({ error: 'Add a contact email before replying' }, { status: 400 })
    }

    const authorName = user.fullName || user.userName || 'ANC Support'
    const sent = await sendTicketReplyEmail({
      to: recipient,
      ticketTitle: ticket.title,
      ticketNumber: ticket.ticket_number,
      venueName: ticket.venue_name || 'ANC Support',
      body: replyBody,
      authorName,
    })

    if (!sent) {
      return NextResponse.json({ error: 'Email could not be sent' }, { status: 502 })
    }

    const commentBody = `Email sent to ${recipient} by ${authorName}:\n\n${replyBody}`
    const commentResult = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, false, NOW())
       RETURNING id, body, is_internal, created_at`,
      [params.id, user.userId, commentBody]
    )

    await query(
      `UPDATE tickets
       SET first_response_at = COALESCE(first_response_at, NOW()),
           sla_response_met = CASE WHEN first_response_at IS NULL THEN (NOW() <= sla_response_due) ELSE sla_response_met END,
           updated_at = NOW()
       WHERE id = $1`,
      [params.id]
    )

    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('email_sent', 'ticket', $1, $2, $3)`,
      [params.id, user.userId, JSON.stringify({
        entity_name: ticket.title,
        venue_name: ticket.venue_name,
        to: recipient,
      })]
    )

    if (ticket.twenty_ticket_id) {
      addTwentyVisibleComment({
        ticketId: ticket.twenty_ticket_id,
        body: commentBody,
        authorName,
        recipient,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, comment: commentResult.rows[0], to: recipient })
  } catch (err) {
    console.error('Error sending ticket email reply:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
