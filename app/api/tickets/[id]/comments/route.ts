import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { jwtVerify } from 'jose'
import { sendTicketDistributionEmail } from '@/lib/email'
import { notifyCustomerReply } from '@/lib/customer-notify'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body, is_internal } = await request.json()
    if (!body || !body.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, body, is_internal, created_at`,
      [params.id, user.userId, body, is_internal || false]
    )

    // Slack notification for all comments
    const ticketInfo = await query(
      `SELECT t.ticket_number, t.title, t.venue_id, v.name as venue_name, v.slack_channel_id
       FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
      [params.id]
    )
    const ti = ticketInfo.rows[0]

    // @-mention DMs: parse @[Full Name] markers and DM each tagged staff
    // member who has a Slack user ID on file. Best-effort — failure doesn't
    // block the comment.
    try {
      const mentionedNames = Array.from(new Set(
        [...String(body).matchAll(/@\[([^\]]+)\]/g)].map(m => m[1].trim()).filter(Boolean)
      ))
      if (mentionedNames.length > 0 && ti) {
        const caseNumDm = String(ti.ticket_number).padStart(8, '0')
        const ticketUrl = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}`
        const mentioned = await query(
          `SELECT id, full_name, slack_user_ids FROM staff WHERE full_name = ANY($1::text[]) AND is_active = true`,
          [mentionedNames]
        )
        for (const m of mentioned.rows) {
          if (m.id === user.userId) continue
          const slackUserId = (m.slack_user_ids || [])[0]
          if (!slackUserId) continue
          sendSlackMessage({
            channel: slackUserId,
            text: `🔔 ${user.fullName || 'A teammate'} tagged you on Case #${caseNumDm}`,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: `🔔 *${user.fullName || 'A teammate'} tagged you on Case #${caseNumDm}*\n*${ti.title}* @ ${ti.venue_name}` } },
              { type: 'section', text: { type: 'mrkdwn', text: `> ${String(body).substring(0, 300)}${String(body).length > 300 ? '...' : ''}` } },
              { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View Ticket' }, url: ticketUrl, style: 'primary' }] },
            ],
          })
        }
      }
    } catch (mentionErr) {
      console.error('[mentions] DM dispatch failed:', mentionErr)
    }

    if (ti) {
      const caseNum = String(ti.ticket_number).padStart(8, '0')
      const channelId = ti.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (channelId) {
        const emoji = is_internal ? ':memo:' : ':speech_balloon:'
        const label = is_internal ? 'Internal Note' : 'Comment'
        sendSlackMessage({
          channel: channelId,
          text: `${emoji} Case #${caseNum} — ${label} by ${user.fullName || 'User'}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Case #${caseNum} — New ${label}*\n*${ti.title}*` } },
            { type: 'section', text: { type: 'mrkdwn', text: `*${user.fullName || 'User'}* ${is_internal ? '_(internal)_' : ''}:\n> ${body.substring(0, 300)}${body.length > 300 ? '...' : ''}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}|:link: View Ticket>` } },
          ],
        })
      }
    }

    // Track first response for SLA (external comments only). Also send the
    // client email and SURFACE the send status back to the UI so the user
    // knows whether the email actually went out. Chris's complaint 5/13:
    // "external isn't behaving" — silent no-op when the venue has no
    // distribution list is the real bug.
    let emailStatus: { sent: boolean; recipient_count: number; reason?: string } | null = null
    if (!is_internal) {
      await query(
        `UPDATE tickets SET first_response_at = NOW(), sla_response_met = (NOW() <= sla_response_due)
         WHERE id = $1 AND first_response_at IS NULL`,
        [params.id]
      )

      const ticketRes = await query(
        `SELECT t.title, t.ticket_number, t.venue_id FROM tickets t WHERE t.id = $1`,
        [params.id]
      )
      const t = ticketRes.rows[0]
      if (t) {
        try {
          emailStatus = await sendTicketDistributionEmail({
            venueId: t.venue_id,
            ticketTitle: t.title,
            ticketNumber: t.ticket_number,
            type: 'comment',
            detail: body,
          })
        } catch (err) {
          console.error('[email] Comment email failed:', err)
          emailStatus = { sent: false, recipient_count: 0, reason: 'send_failed' }
        }
      }

      // Portal customer (the requester) gets their own notification with a
      // portal deep link. Fire-and-forget — never blocks the staff action.
      notifyCustomerReply({
        ticketId: params.id,
        body,
        authorName: user.fullName || 'ANC Support',
      }).catch(err => console.error('[customer-notify] reply email failed:', err))
    }

    return NextResponse.json({ comment: result.rows[0], email: emailStatus })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
