import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { applyTicketClose } from '@/lib/ticket-close'
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

    // `close_ticket` (Chris D, 7/14): post the note AND close in one action, so
    // the team gets one Slack notification instead of one for the note and a
    // second for the close.
    // `set_status: 'in_progress'` (Chris D, 7/15): same idea for picking a
    // ticket up — post the note and move New/On Hold to In Progress in one
    // action. Never demotes Escalated or reopens Closed; those stay put and
    // the note posts normally.
    const { body, is_internal, close_ticket, set_status } = await request.json()
    if (!body || !body.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
    }
    const closeRequested = close_ticket === true || set_status === 'closed'
    const inProgressRequested = set_status === 'in_progress'

    const result = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, body, is_internal, created_at`,
      [params.id, user.userId, body, is_internal || false]
    )

    // Slack notification for all comments
    const ticketInfo = await query(
      `SELECT t.ticket_number, t.title, t.venue_id, t.status, t.assigned_to,
              v.name as venue_name, v.slack_channel_id
       FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
      [params.id]
    )
    const ti = ticketInfo.rows[0]

    // Post-and-close: run the same close side-effects as the Close button, then
    // announce note + close together in ONE message below.
    let closed = false
    if (closeRequested && ti && ti.status !== 'closed') {
      await applyTicketClose({
        ticketId: params.id,
        ticket: {
          ticket_number: ti.ticket_number,
          status: ti.status,
          title: ti.title,
          venue_id: ti.venue_id,
          assigned_to: ti.assigned_to,
        },
        venueName: ti.venue_name || '',
        actor: { userId: user.userId, fullName: user.fullName },
      })
      closed = true
    }

    // Post-and-in-progress: only a forward move — New or On Hold may advance.
    // Escalated must never quietly drop back to In Progress (Chris's explicit
    // guard), and Closed doesn't reopen from the composer.
    let movedInProgress = false
    if (inProgressRequested && !closed && ti && (ti.status === 'new' || ti.status === 'on_hold')) {
      await query(`UPDATE tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [params.id])
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('ticket_status_change', 'ticket', $1, $2, $3)`,
        [params.id, user.userId || null, JSON.stringify({
          entity_name: ti.title,
          venue_name: ti.venue_name || '',
          old_status: ti.status,
          new_status: 'in_progress',
        })]
      )
      try {
        fs.appendFileSync(
          '/tmp/anc-ticket-notifications.log',
          `TICKET|status_changed|${user.fullName || 'User'}|${ti.title}|${ti.venue_name || ''}|from ${ti.status} to In Progress|${new Date().toISOString()}\n`
        )
      } catch { /* log file is best-effort */ }
      movedInProgress = true
    }

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
        // One message covers both the note and the close when they happen
        // together — that's the whole point of post-and-close.
        const emoji = closed ? ':white_check_mark:' : movedInProgress ? ':arrows_counterclockwise:' : is_internal ? ':memo:' : ':speech_balloon:'
        const label = closed
          ? 'Resolved & Closed'
          : movedInProgress ? 'In Progress'
          : is_internal ? 'Internal Note' : 'Comment'
        const heading = closed
          ? `${emoji} *Case #${caseNum} — Resolved & Closed*\n*${ti.title}*`
          : movedInProgress
          ? `${emoji} *Case #${caseNum} — Moved to In Progress*\n*${ti.title}*`
          : `${emoji} *Case #${caseNum} — New ${label}*\n*${ti.title}*`
        sendSlackMessage({
          channel: channelId,
          text: `${emoji} Case #${caseNum} — ${label} by ${user.fullName || 'User'}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: heading } },
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

    return NextResponse.json({ comment: result.rows[0], email: emailStatus, closed, moved_in_progress: movedInProgress })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
