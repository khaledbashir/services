import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'

const PROD_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://services.ancsports.net'

async function findTicket(numberOrId: string) {
  const trimmed = numberOrId.replace(/^#/, '').trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const r = await dbQuery(
      `SELECT t.id, t.ticket_number, t.title, t.venue_id, v.name as venue_name, v.slack_channel_id
       FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
       WHERE t.ticket_number = $1 LIMIT 1`,
      [parseInt(trimmed, 10)]
    )
    return r.rows[0] || null
  }
  const r = await dbQuery(
    `SELECT t.id, t.ticket_number, t.title, t.venue_id, v.name as venue_name, v.slack_channel_id
     FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
     WHERE t.id = $1::uuid LIMIT 1`,
    [trimmed]
  )
  return r.rows[0] || null
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json_body' }, { status: 400 })
  }

  const auth = await authorizeVoiceCall(request, typeof body.staff_email === 'string' ? body.staff_email : null)
  if (!auth.ok) return auth.response

  if (!auth.staff) {
    return NextResponse.json({ ok: false, error: 'staff_email_unrecognized' }, { status: 400 })
  }

  const ref = cleanQuery(typeof body.ticket === 'string' ? body.ticket : '', 60)
  const note = cleanQuery(typeof body.note === 'string' ? body.note : '', 4000)
  const isInternalRaw = body.is_internal
  const isInternal = isInternalRaw === true || isInternalRaw === 'true'

  if (!ref) return NextResponse.json({ ok: false, error: 'ticket_required' }, { status: 400 })
  if (!note) return NextResponse.json({ ok: false, error: 'note_required' }, { status: 400 })

  try {
    const ticket = await findTicket(ref)
    if (!ticket) {
      return NextResponse.json({ ok: false, error: 'ticket_not_found', voiceBrief: `No ticket matching ${ref}.` }, { status: 404 })
    }

    const insert = await dbQuery(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [ticket.id, auth.staff.id, note, isInternal]
    )

    const ticketUrl = `${PROD_BASE}/tickets/${ticket.id}`
    const caseNum = String(ticket.ticket_number).padStart(8, '0')
    const channelId = ticket.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      sendSlackMessage({
        channel: channelId,
        text: `:speech_balloon: Case #${caseNum} comment from ${auth.staff.fullName} (voice)`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `:speech_balloon: *Case #${caseNum} — Voice comment from ${auth.staff.fullName}*${isInternal ? ' _(internal)_' : ''}\n*${ticket.title}*\n\n${note}` } },
          { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
        ],
      }).catch(err => console.error('[voice] slack notify failed:', err))
    }

    return NextResponse.json({
      ok: true,
      added: true,
      caller: auth.staff.fullName,
      commentId: insert.rows[0].id,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        ticketLabel: String(ticket.ticket_number).padStart(4, '0'),
        title: ticket.title,
        venue: ticket.venue_name,
        url: ticketUrl,
      },
      voiceBrief: `Comment saved on ticket ${String(ticket.ticket_number).padStart(4, '0')}${isInternal ? ' as internal note' : ''}. Slack channel notified.`,
    })
  } catch (error) {
    console.error('voice add-ticket-comment error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'comment_failed' },
      { status: 500 }
    )
  }
}
