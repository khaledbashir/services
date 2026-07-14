/**
 * Closing a ticket — the single code path.
 *
 * Two surfaces close tickets: the Close button (PATCH /api/tickets/[id]) and
 * "Post and close" on the comment composer (Chris D, 7/14 — posting then
 * closing fired two separate Slack notifications for one action). Both run the
 * same side-effects here; only the Slack message differs, so the caller owns
 * that and this returns everything needed to compose it.
 */

import fs from 'fs'
import { query } from '@/lib/db'
import { notifyCustomerStatus } from '@/lib/customer-notify'
import { awardPointsOnce } from '@/lib/gamification'

export type ClosableTicket = {
  ticket_number: number | string
  status: string
  title: string
  venue_id: string | null
  assigned_to: string | null
}

export type TicketCloseResult = {
  caseNumber: string
  slackChannelId: string
  previousStatus: string
}

/**
 * Apply every side-effect of moving a ticket to `closed`, EXCEPT the Slack
 * message (the caller sends it — a plain close and a post-and-close say
 * different things). Safe to call only when the ticket isn't already closed.
 */
export async function applyTicketClose({
  ticketId,
  ticket,
  venueName,
  actor,
  resolutionNotes,
}: {
  ticketId: string
  ticket: ClosableTicket
  venueName: string
  actor: { userId?: string | null; fullName?: string | null }
  resolutionNotes?: string | null
}): Promise<TicketCloseResult> {
  const sets = [
    `status = 'closed'`,
    `updated_at = NOW()`,
    `resolved_at = NOW()`,
    `sla_resolution_met = (NOW() <= sla_resolution_due OR sla_resolution_due IS NULL)`,
  ]
  const values: unknown[] = [ticketId]
  if (resolutionNotes !== undefined && resolutionNotes !== null) {
    sets.push(`resolution_notes = $2`)
    values.push(resolutionNotes)
  }
  await query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $1`, values)

  await query(
    `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
     VALUES ('ticket_status_change', 'ticket', $1, $2, $3)`,
    [ticketId, actor.userId || null, JSON.stringify({
      entity_name: ticket.title,
      venue_name: venueName,
      old_status: ticket.status,
      new_status: 'closed',
    })]
  )

  // Portal customer notification — fire-and-forget.
  notifyCustomerStatus({ ticketId }).catch((err) =>
    console.error('[customer-notify] status email failed:', err)
  )

  // Gamification: points awarded once, on first close.
  if (ticket.assigned_to) {
    const assignedStaff = await query('SELECT full_name FROM staff WHERE id = $1', [ticket.assigned_to])
    const resolverName = assignedStaff.rows[0]?.full_name
    if (resolverName) {
      awardPointsOnce(ticket.assigned_to, resolverName, 'TICKET_RESOLVED', `ticket:${ticketId}:resolved`, {
        ticket_id: ticketId,
        title: ticket.title,
      }).catch(() => {})
      const slaCheck = await query('SELECT sla_resolution_met FROM tickets WHERE id = $1', [ticketId])
      if (slaCheck.rows[0]?.sla_resolution_met === true) {
        awardPointsOnce(ticket.assigned_to, resolverName, 'TICKET_SLA_MET', `ticket:${ticketId}:sla`, {
          ticket_id: ticketId,
          title: ticket.title,
        }).catch(() => {})
      }
    }
  }

  const caseNumber = String(ticket.ticket_number).padStart(8, '0')
  try {
    fs.appendFileSync(
      '/tmp/anc-ticket-notifications.log',
      `TICKET|status_changed|${actor.fullName || 'User'}|${ticket.title}|${venueName}|from ${ticket.status} to Closed|${new Date().toISOString()}\n`
    )
  } catch { /* log file is best-effort */ }

  let slackChannelId = process.env.SLACK_DEFAULT_CHANNEL || ''
  if (ticket.venue_id) {
    const venue = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [ticket.venue_id])
    slackChannelId = venue.rows[0]?.slack_channel_id || slackChannelId
  }

  return { caseNumber, slackChannelId, previousStatus: ticket.status }
}
