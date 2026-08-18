/**
 * The three things every ticket-creation path owes the rest of the system:
 * route it, record it, deliver it.
 *
 * This exists because the walk-thru checklist (Joe 2026-08-17) opened its
 * automatic ticket with a bare INSERT. The row appeared in the tickets list and
 * nothing else happened: no assignment rule, no SLA clock, no venue Slack post,
 * no distribution email, no activity entry, no CRM sync. A ticket nobody is
 * told about is not a ticket.
 *
 * Rather than copy those steps into the walk-thru, both paths now call the same
 * functions, so a change to how tickets are announced can never again reach one
 * creator and not the other.
 *
 *   resolveTicketRouting()  — who owns it, when it is due   (BEFORE the insert)
 *   recordTicketCreated()   — activity + notification log    (fast, always awaited)
 *   deliverTicketCreated()  — Slack, distribution email, CRM (network, awaited
 *                             only where the caller reports the outcome back)
 *
 * The record/deliver split keeps the manual ticket form as quick as it is
 * today — it records, then lets delivery finish in the background — while the
 * walk-thru submit waits, because it tells the technician what went out.
 */
import * as fs from 'fs'
import { query } from '@/lib/db'
import { sendTicketNotification } from '@/lib/slack'
import { sendTicketDistributionEmail } from '@/lib/email'
import { syncTicketsToTwenty } from '@/lib/twenty-sync'

export interface TicketRouting {
  assignedTo: string | null
  slaResponseDue: Date | null
  slaResolutionDue: Date | null
}

/**
 * Apply the venue/category assignment rules and the SLA policy for a priority.
 *
 * An explicit assignee always wins — a rule is a default, not an override.
 */
export async function resolveTicketRouting(input: {
  venueId: string | null
  category?: string | null
  priority?: string | null
  assignedTo?: string | null
  now?: Date
}): Promise<TicketRouting> {
  const category = input.category || 'general'
  const priority = input.priority || 'medium'

  let assignedTo = input.assignedTo || null
  if (!assignedTo) {
    const ruleResult = await query(
      `SELECT assign_to FROM assignment_rules
       WHERE is_active = true
         AND (category IS NULL OR category = $1)
         AND (venue_id IS NULL OR venue_id = $2)
       ORDER BY
         CASE WHEN venue_id IS NOT NULL AND category IS NOT NULL THEN 1
              WHEN venue_id IS NOT NULL THEN 2
              WHEN category IS NOT NULL THEN 3
              ELSE 4 END,
         priority DESC
       LIMIT 1`,
      [category, input.venueId],
    )
    if (ruleResult.rows.length > 0) assignedTo = ruleResult.rows[0].assign_to
  }

  const slaResult = await query(
    `SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`,
    [priority],
  )
  const sla = slaResult.rows[0]
  const now = input.now || new Date()

  return {
    assignedTo,
    slaResponseDue: sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null,
    slaResolutionDue: sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null,
  }
}

export interface CreatedTicket {
  id: string
  ticket_number: number
  title: string
  category?: string | null
  priority?: string | null
  status?: string | null
}

export interface TicketDeliveryResult {
  slack_posted: boolean
  distribution_emailed: boolean
  distribution_recipients: number
}

/**
 * The local, instant half: the activity feed entry and the notification log the
 * Slack assistant tails. Cheap enough to always await, so neither can be lost
 * to a process restart between the insert and the response.
 */
export async function recordTicketCreated(input: {
  ticket: CreatedTicket
  venueName: string
  createdBy: string | null
  createdByName?: string | null
}): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_created', 'ticket', $1, $2, $3)`,
      [
        input.ticket.id,
        input.createdBy,
        JSON.stringify({
          entity_name: input.ticket.title,
          venue_name: input.venueName,
          priority: input.ticket.priority || 'medium',
          category: input.ticket.category || 'general',
        }),
      ],
    )
  } catch (err) {
    console.error('[ticket-create] activity log failed:', err)
  }

  try {
    fs.appendFileSync(
      '/tmp/anc-ticket-notifications.log',
      `TICKET|created|${input.createdByName || 'User'}|${input.ticket.title}|${input.venueName}|${new Date().toISOString()}\n`,
    )
  } catch (err) {
    console.error('[ticket-create] notification log failed:', err)
  }
}

/**
 * The outbound half: the venue's Slack channel, the venue's ticket distribution
 * list, and the CRM mirror.
 *
 * Every step is guarded on its own — a Slack outage must not stop the email —
 * and none of them may throw at the caller, because the ticket is already real
 * by the time this runs.
 */
export async function deliverTicketCreated(input: {
  ticket: CreatedTicket
  venueId: string | null
  venueName: string
  description?: string | null
  assignedTo?: string | null
  resolutionNotes?: string | null
  imageUrl?: string | null
}): Promise<TicketDeliveryResult> {
  const result: TicketDeliveryResult = {
    slack_posted: false,
    distribution_emailed: false,
    distribution_recipients: 0,
  }

  const category = input.ticket.category || 'general'
  const priority = input.ticket.priority || 'medium'
  const description = input.description || ''

  try {
    const slackChRes = input.venueId
      ? await query('SELECT slack_channel_id FROM venues WHERE id = $1', [input.venueId])
      : { rows: [] as any[] }
    const channelId = slackChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      result.slack_posted = await sendTicketNotification(
        {
          id: input.ticket.id,
          ticket_number: input.ticket.ticket_number,
          title: input.ticket.title,
          category,
          priority,
          venue_name: input.venueName,
          description: description || undefined,
          image_url: input.imageUrl || undefined,
        },
        'created',
        channelId,
      )
    }
  } catch (err) {
    console.error('[ticket-create] slack notification failed:', err)
  }

  if (input.venueId) {
    try {
      const emailed = await sendTicketDistributionEmail({
        venueId: input.venueId,
        ticketTitle: input.ticket.title,
        ticketNumber: input.ticket.ticket_number,
        type: 'created',
        detail: description || input.ticket.title,
      })
      result.distribution_emailed = emailed.sent
      result.distribution_recipients = emailed.recipient_count
    } catch (err) {
      console.error('[ticket-create] distribution email failed:', err)
    }
  }

  try {
    await syncTicketsToTwenty([
      {
        id: input.ticket.id,
        title: input.ticket.title,
        ticket_number: input.ticket.ticket_number,
        status: input.ticket.status || 'new',
        priority,
        category,
        venue_name: input.venueName,
        venue_id: input.venueId || undefined,
        assigned_to: input.assignedTo || '',
        description,
        resolution_notes: input.resolutionNotes || '',
      },
    ])
  } catch (err) {
    console.error('[ticket-create] twenty sync failed:', err)
  }

  return result
}
