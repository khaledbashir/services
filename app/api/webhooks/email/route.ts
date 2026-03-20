import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

// Resend inbound email webhook
// Webhook sends metadata only — we call Resend API to get the full email body

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    // Resend sends { type: 'email.received', data: { ... } }
    const event = payload.type || payload.event
    const data = payload.data || payload

    // Handle both direct payload and wrapped event format
    const emailId = data.email_id || data.id
    const from = data.from || ''
    const to = data.to || ''
    const subject = data.subject || 'No subject'

    // If we have an email ID and API key, fetch the full email body
    let emailBody = data.text || data.body || ''

    if (emailId && RESEND_API_KEY && !emailBody) {
      try {
        const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
        })
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          emailBody = emailData.text || emailData.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || ''
        }
      } catch (e) {
        console.error('Failed to fetch email body from Resend:', e)
      }
    }

    // Extract sender info
    const senderEmail = typeof from === 'string' ? from : (Array.isArray(from) ? from[0] : from?.address || from?.email || '')
    const senderName = senderEmail.split('@')[0] || 'Unknown'

    if (!senderEmail) {
      return NextResponse.json({ ok: true, message: 'No sender, skipping' })
    }

    // Match sender to a venue contact
    let venueId: string | null = null
    let venueName = 'Unknown Venue'
    let channelId = ''

    // Try exact email match
    const venueResult = await query(
      `SELECT id, name, slack_channel_id FROM venues WHERE primary_contact_email ILIKE $1 LIMIT 1`,
      [senderEmail]
    )

    if (venueResult.rows.length > 0) {
      venueId = venueResult.rows[0].id
      venueName = venueResult.rows[0].name
      channelId = venueResult.rows[0].slack_channel_id || ''
    } else {
      // Try domain match
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

    // Fallback to first venue if no match
    if (!venueId) {
      const fallback = await query(`SELECT id, name FROM venues ORDER BY name LIMIT 1`)
      if (fallback.rows.length > 0) {
        venueId = fallback.rows[0].id
        venueName = fallback.rows[0].name
      }
    }

    if (!venueId) {
      return NextResponse.json({ ok: true, message: 'No venue matched' })
    }

    // SLA + auto-assignment
    const slaResult = await query(`SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = 'medium' LIMIT 1`)
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    const ruleResult = await query(
      `SELECT assign_to FROM assignment_rules WHERE is_active = true
       AND (category IS NULL OR category = 'general') AND (venue_id IS NULL OR venue_id = $1)
       ORDER BY CASE WHEN venue_id IS NOT NULL THEN 1 ELSE 2 END LIMIT 1`,
      [venueId]
    )
    const autoAssign = ruleResult.rows[0]?.assign_to || null

    // Create ticket
    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    const description = emailBody
      ? `Email from ${senderName} (${senderEmail}):\n\n${emailBody.substring(0, 2000)}`
      : `Email received from ${senderName} (${senderEmail}). Subject: ${subject}`

    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by, assigned_to, sla_response_due, sla_resolution_due, original_message)
       VALUES ($1, $2, $3, 'general', 'medium', 'open', $4, $5, $6, $7, $8)
       RETURNING id, ticket_number, title, category, priority, status`,
      [venueId, subject.substring(0, 100), description, CLAW_STAFF_ID, autoAssign, slaResponseDue, slaResolutionDue, emailBody || subject]
    )

    const ticket = result.rows[0]

    // Slack notification
    const slackChannel = channelId || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (slackChannel) {
      await sendSlackMessage({
        channel: slackChannel,
        text: `📧 Email ticket #${ticket.ticket_number}: ${subject}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `📧 *Email Ticket #${ticket.ticket_number} created*\n*${subject}*` },
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
          ...(emailBody ? [
            { type: 'divider' },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `💬 *Email body:* _"${emailBody.substring(0, 300)}${emailBody.length > 300 ? '...' : ''}"_` }] },
          ] : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `⏱️ *SLA Response due in ${sla?.response_hours || 4}h* | _Auto-created from inbound email_` }],
          },
        ],
      })
    }

    return NextResponse.json({
      ok: true,
      ticket_number: ticket.ticket_number,
      venue: venueName,
    })
  } catch (err) {
    console.error('Error processing inbound email:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
