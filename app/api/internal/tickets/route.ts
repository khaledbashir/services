import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import { sendTicketDistributionEmail } from '@/lib/email'

const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'anc-internal-2026'

/**
 * Internal ticket creation endpoint for Claw bot.
 * No JWT required — uses a simple API key.
 * Handles: Slack notification to venue channel, SLA, auto-assignment, email distribution.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-api-key') || ''
    if (authHeader !== INTERNAL_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { venue_id, title, description, priority, category, assigned_to } = await request.json()
    if (!venue_id || !title) {
      return NextResponse.json({ error: 'venue_id and title are required' }, { status: 400 })
    }

    // Auto-assignment if none specified
    let effectiveAssignee = assigned_to || null
    if (!effectiveAssignee) {
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
        [category || 'general', venue_id]
      )
      if (ruleResult.rows.length > 0) {
        effectiveAssignee = ruleResult.rows[0].assign_to
      }
    }

    // SLA
    const ticketPriority = priority || 'medium'
    const slaResult = await query(
      `SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`,
      [ticketPriority]
    )
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    // Create ticket
    const result = await query(
      `INSERT INTO tickets (venue_id, created_by, assigned_to, title, description, priority, status, category, sla_response_due, sla_resolution_due)
       VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9)
       RETURNING id, ticket_number, title, priority, status, category`,
      [venue_id, CLAW_STAFF_ID, effectiveAssignee, title, description || '', ticketPriority, category || 'general', slaResponseDue, slaResolutionDue]
    )

    const ticket = result.rows[0]

    // Get venue info
    const venueRes = await query('SELECT name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const venueName = venueRes.rows[0]?.name || 'Unknown Venue'
    const channelId = venueRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''

    // Slack notification to venue channel
    if (channelId) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category,
        priority: ticket.priority,
        venue_name: venueName,
        description: description || undefined,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    // Email distribution list
    sendTicketDistributionEmail({
      venueId: venue_id,
      ticketTitle: title,
      ticketNumber: ticket.ticket_number,
      type: 'created',
      detail: description || title,
    }).catch(err => console.error('[email] Internal ticket email failed:', err))

    return NextResponse.json({
      ok: true,
      ticket_number: ticket.ticket_number,
      ticket_id: ticket.id,
      venue: venueName,
      channel_notified: channelId || 'none',
    })
  } catch (err) {
    console.error('Error creating internal ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
