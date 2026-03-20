import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'

// Resend inbound email webhook
// Receives emails sent to support@anc.com (or send.anc.com)
// Auto-creates a ticket from the email content

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Resend inbound webhook payload
    const { from, to, subject, text, html } = body

    if (!from || !subject) {
      return NextResponse.json({ error: 'Missing from or subject' }, { status: 400 })
    }

    // Extract sender email
    const senderEmail = typeof from === 'string' ? from : from?.address || from?.email || ''
    const senderName = typeof from === 'string' ? from.split('@')[0] : from?.name || from?.address?.split('@')[0] || 'Unknown'

    // Try to match sender to a venue contact
    const venueResult = await query(
      `SELECT id, name, slack_channel_id FROM venues WHERE primary_contact_email ILIKE $1 LIMIT 1`,
      [senderEmail]
    )

    // If no venue match, try to find by domain
    let venueId: string | null = null
    let venueName = 'Unknown Venue'
    let channelId = ''

    if (venueResult.rows.length > 0) {
      venueId = venueResult.rows[0].id
      venueName = venueResult.rows[0].name
      channelId = venueResult.rows[0].slack_channel_id || ''
    } else {
      // Try matching email domain to any venue contact
      const domain = senderEmail.split('@')[1]
      if (domain) {
        const domainResult = await query(
          `SELECT id, name, slack_channel_id FROM venues WHERE primary_contact_email ILIKE $1 LIMIT 1`,
          [`%@${domain}`]
        )
        if (domainResult.rows.length > 0) {
          venueId = domainResult.rows[0].id
          venueName = domainResult.rows[0].name
          channelId = domainResult.rows[0].slack_channel_id || ''
        }
      }
    }

    // If still no venue, use the first venue as fallback (or create without venue)
    if (!venueId) {
      const fallbackResult = await query(`SELECT id, name FROM venues ORDER BY name LIMIT 1`)
      if (fallbackResult.rows.length > 0) {
        venueId = fallbackResult.rows[0].id
        venueName = fallbackResult.rows[0].name
      }
    }

    if (!venueId) {
      return NextResponse.json({ error: 'No venue found' }, { status: 400 })
    }

    // Clean up email body
    const emailBody = (text || '').substring(0, 2000).trim()
    const title = subject.substring(0, 100)

    // SLA
    const slaResult = await query(`SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = 'medium' LIMIT 1`)
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    // Auto-assignment
    const ruleResult = await query(
      `SELECT assign_to FROM assignment_rules WHERE is_active = true
       AND (category IS NULL OR category = 'general') AND (venue_id IS NULL OR venue_id = $1)
       ORDER BY CASE WHEN venue_id IS NOT NULL THEN 1 WHEN category IS NOT NULL THEN 2 ELSE 3 END LIMIT 1`,
      [venueId]
    )
    const autoAssign = ruleResult.rows[0]?.assign_to || null

    // Create ticket
    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by, assigned_to, sla_response_due, sla_resolution_due, original_message)
       VALUES ($1, $2, $3, 'general', 'medium', 'open', $4, $5, $6, $7, $8)
       RETURNING id, ticket_number, title, category, priority, status`,
      [venueId, title, `Email from ${senderName} (${senderEmail}):\n\n${emailBody}`, CLAW_STAFF_ID, autoAssign, slaResponseDue, slaResolutionDue, emailBody]
    )

    const ticket = result.rows[0]

    // Slack notification
    const slackChannel = channelId || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (slackChannel) {
      await sendSlackMessage({
        channel: slackChannel,
        text: `📧 Email ticket #${ticket.ticket_number}: ${title}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📧 *Email Ticket #${ticket.ticket_number} created*\n*${title}*`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*From:*\n${senderName} (${senderEmail})` },
              { type: 'mrkdwn', text: `*Venue:*\n${venueName}` },
              { type: 'mrkdwn', text: `*Priority:*\n:large_yellow_circle: medium` },
              { type: 'mrkdwn', text: `*Status:*\nopen` },
            ],
          },
          { type: 'divider' },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `💬 *Email body:* _"${emailBody.substring(0, 300)}${emailBody.length > 300 ? '...' : ''}"_` }],
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `⏱️ *SLA Response due in ${sla?.response_hours || 4}h* | _Auto-created from support@anc.com_` }],
          },
        ],
      })
    }

    return NextResponse.json({
      ok: true,
      ticket_number: ticket.ticket_number,
      venue: venueName,
      message: `Ticket #${ticket.ticket_number} created from email`,
    })
  } catch (err) {
    console.error('Error processing inbound email:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
