/**
 * Posting a ticket comment — the single code path.
 *
 * Two surfaces post comments: the dashboard composer (POST
 * /api/tickets/[id]/comments) and the Reply modal on Slack ticket cards
 * (Chris D 7/15). Both need the same side-effects — insert, optional one-click
 * status action, @-mention DMs, ONE combined Slack channel notification,
 * SLA first-response tracking, client distribution email, portal customer
 * notify — so they live here, exactly as the composer shipped them.
 */

import { query } from '@/lib/db'
import {
  sendSlackMessageDetailed,
  ticketActionBlock,
  buildTicketDescriptionTeaser,
  buildTicketDescriptionThreadBlocks,
} from '@/lib/slack'
import { applyTicketClose, applyTicketInProgress } from '@/lib/ticket-close'
import { sendTicketDistributionEmail } from '@/lib/email'
import { notifyCustomerReply } from '@/lib/customer-notify'
import { normalizeAttachment } from '@/lib/ticket-attachments'
import { DASHBOARD_URL } from '@/lib/app-url'

export type PostTicketCommentResult = {
  comment: any
  closed: boolean
  movedInProgress: boolean
  email: { sent: boolean; recipient_count: number; reason?: string } | null
  attachments: any[]
}

export async function postTicketComment({
  ticketId,
  body,
  isInternal,
  actor,
  statusAction,
  via,
  attachments,
}: {
  ticketId: string
  body: string
  isInternal: boolean
  actor: { userId?: string | null; fullName?: string | null }
  statusAction?: 'close' | 'in_progress'
  via?: 'dashboard' | 'slack'
  /** Screenshots/files posted with the note (Chris D 7/29). */
  attachments?: unknown[]
}): Promise<PostTicketCommentResult> {
  const result = await query(
    `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, body, is_internal, created_at`,
    [ticketId, actor.userId, body, isInternal]
  )

  // Files ride with the note and inherit its visibility, so a screenshot on an
  // internal note can never be more visible than the note it belongs to.
  const savedAttachments: any[] = []
  for (const raw of attachments ?? []) {
    const file = normalizeAttachment(raw)
    if (!file) continue
    const inserted = await query(
      `INSERT INTO ticket_attachments (ticket_id, comment_id, filename, mime_type, image_url, uploaded_by, is_internal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, ticket_id, comment_id, filename, mime_type, image_url, caption, is_internal,
                 TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as created_date`,
      [ticketId, result.rows[0].id, file.filename, file.mimeType, file.imageUrl, actor.userId, isInternal]
    )
    savedAttachments.push(inserted.rows[0])
  }

  const ticketInfo = await query(
    `SELECT t.ticket_number, t.title, t.venue_id, t.status, t.assigned_to,
            v.name as venue_name, v.slack_channel_id
     FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
    [ticketId]
  )
  const ti = ticketInfo.rows[0]

  // One-click status actions: run the same side-effects as the status buttons,
  // then announce note + status change together in ONE message below.
  // `applyTicketInProgress` enforces the forward-only guard (never demotes
  // Escalated, never reopens Closed) and returns false when blocked.
  let closed = false
  let movedInProgress = false
  if (statusAction === 'close' && ti && ti.status !== 'closed') {
    await applyTicketClose({
      ticketId,
      ticket: {
        ticket_number: ti.ticket_number,
        status: ti.status,
        title: ti.title,
        venue_id: ti.venue_id,
        assigned_to: ti.assigned_to,
      },
      venueName: ti.venue_name || '',
      actor,
    })
    closed = true
  } else if (statusAction === 'in_progress' && ti) {
    movedInProgress = await applyTicketInProgress({
      ticketId,
      ticket: {
        ticket_number: ti.ticket_number,
        status: ti.status,
        title: ti.title,
        venue_id: ti.venue_id,
        assigned_to: ti.assigned_to,
      },
      venueName: ti.venue_name || '',
      actor,
    })
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
      const ticketUrl = `${DASHBOARD_URL}/tickets/${ticketId}`
      const mentioned = await query(
        `SELECT id, full_name, slack_user_ids FROM staff WHERE full_name = ANY($1::text[]) AND is_active = true`,
        [mentionedNames]
      )
      for (const m of mentioned.rows) {
        if (m.id === actor.userId) continue
        const slackUserId = (m.slack_user_ids || [])[0]
        if (!slackUserId) continue
        const dmTeaser = buildTicketDescriptionTeaser(String(body))
        void (async () => {
          try {
            const dm = await sendSlackMessageDetailed({
              channel: slackUserId,
              text: `🔔 ${actor.fullName || 'A teammate'} tagged you on Case #${caseNumDm}`,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: `🔔 *${actor.fullName || 'A teammate'} tagged you on Case #${caseNumDm}*\n*${ti.title}* @ ${ti.venue_name}` } },
                // A comment can be attachments only — an empty section is an API error.
                ...(dmTeaser.text ? [{ type: 'section', text: { type: 'mrkdwn', text: dmTeaser.text } }] : []),
                { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View Ticket' }, url: ticketUrl, style: 'primary' }] },
              ],
            })
            if (dmTeaser.hasMore && dm.ok && dm.ts) {
              await sendSlackMessageDetailed({
                channel: slackUserId,
                thread_ts: dm.ts,
                text: `Full note for Case #${caseNumDm}`,
                blocks: [
                  { type: 'context', elements: [{ type: 'mrkdwn', text: `:memo: *Full note — Case #${caseNumDm}*` }] },
                  ...buildTicketDescriptionThreadBlocks(String(body)),
                ],
              })
            }
          } catch (dmErr) {
            console.error('[mentions] DM dispatch failed:', dmErr)
          }
        })()
      }
    }
  } catch (mentionErr) {
    console.error('[mentions] DM dispatch failed:', mentionErr)
  }

  if (ti) {
    const caseNum = String(ti.ticket_number).padStart(8, '0')
    const channelId = ti.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      // One message covers both the note and the status change when they
      // happen together — that's the whole point of the one-click actions.
      const emoji = closed ? ':white_check_mark:' : movedInProgress ? ':arrows_counterclockwise:' : isInternal ? ':memo:' : ':speech_balloon:'
      const label = closed
        ? 'Resolved & Closed'
        : movedInProgress ? 'In Progress'
        : isInternal ? 'Internal Note' : 'Comment'
      const heading = closed
        ? `${emoji} *Case #${caseNum} — Resolved & Closed*\n*${ti.title}*`
        : movedInProgress
        ? `${emoji} *Case #${caseNum} — Moved to In Progress*\n*${ti.title}*`
        : `${emoji} *Case #${caseNum} — New ${label}*\n*${ti.title}*`
      const authorLine = `*${actor.fullName || 'User'}*${via === 'slack' ? ' _(from Slack)_' : ''} ${isInternal ? '_(internal)_' : ''}`
      const statusAfter = closed ? 'closed' : movedInProgress ? 'in_progress' : ti.status
      // Chris D 2026-08-19: "Can the notes come through in slack with the full
      // note?" — a note was cut dead at 300 characters with nothing behind it,
      // so Steve's note ended mid-word at "the issue ap…" and the rest existed
      // only on the ticket. Ticket descriptions already solved this in Joe's
      // 2026-05-04 shape: scannable card in channel, full body in the thread.
      // Notes now do the same thing.
      const noteTeaser = buildTicketDescriptionTeaser(String(body))
      void (async () => {
        try {
          const posted = await sendSlackMessageDetailed({
            channel: channelId,
            text: `${emoji} Case #${caseNum} — ${label} by ${actor.fullName || 'User'}`,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: heading } },
              { type: 'section', text: { type: 'mrkdwn', text: `${authorLine}:${noteTeaser.text ? `\n${noteTeaser.text}` : ''}` } },
              ticketActionBlock(ticketId, statusAfter),
            ],
          })
          if (noteTeaser.hasMore && posted.ok && posted.ts) {
            await sendSlackMessageDetailed({
              channel: channelId,
              thread_ts: posted.ts,
              text: `Full note for Case #${caseNum}`,
              blocks: [
                { type: 'context', elements: [{ type: 'mrkdwn', text: `:memo: *Full note — Case #${caseNum}*` }] },
                ...buildTicketDescriptionThreadBlocks(String(body)),
              ],
            })
          }
        } catch (slackErr) {
          console.error('[ticket-comment] slack notification failed:', slackErr)
        }
      })()
    }
  }

  // Track first response for SLA (external comments only). Also send the
  // client email and SURFACE the send status back to the UI so the user
  // knows whether the email actually went out. Chris's complaint 5/13:
  // "external isn't behaving" — silent no-op when the venue has no
  // distribution list is the real bug.
  let emailStatus: { sent: boolean; recipient_count: number; reason?: string } | null = null
  if (!isInternal) {
    await query(
      `UPDATE tickets SET first_response_at = NOW(), sla_response_met = (NOW() <= sla_response_due)
       WHERE id = $1 AND first_response_at IS NULL`,
      [ticketId]
    )

    const ticketRes = await query(
      `SELECT t.title, t.ticket_number, t.venue_id FROM tickets t WHERE t.id = $1`,
      [ticketId]
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
          authorName: actor.fullName || 'ANC Support',
        })
      } catch (err) {
        console.error('[email] Comment email failed:', err)
        emailStatus = { sent: false, recipient_count: 0, reason: 'send_failed' }
      }
    }

    // Portal customer (the requester) gets their own notification with a
    // portal deep link. Fire-and-forget — never blocks the staff action.
    notifyCustomerReply({
      ticketId,
      body,
      authorName: actor.fullName || 'ANC Support',
    }).catch(err => console.error('[customer-notify] reply email failed:', err))
  }

  return { comment: result.rows[0], closed, movedInProgress, email: emailStatus, attachments: savedAttachments }
}
