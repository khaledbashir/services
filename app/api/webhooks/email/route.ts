import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { parseTicketReplyAddress } from '@/lib/email'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

/**
 * Strip quoted reply text and email signatures from an email body.
 */
function cleanEmailReply(body: string): string {
  const lines = body.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    // Stop at quoted text markers
    if (line.match(/^On .+ wrote:$/)) break
    if (line.match(/^>+ /)) break
    if (line.match(/^-{3,}$/)) break
    if (line.match(/^_{3,}$/)) break
    if (line.match(/^From:/i)) break
    if (line.match(/^Sent:/i)) break
    // Stop at common signature markers
    if (line.trim() === '--') break
    if (line.match(/^Get Outlook for/i)) break
    if (line.match(/^Sent from my/i)) break
    cleaned.push(line)
  }
  return cleaned.join('\n').trim()
}

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

    // Check if this is a reply to an existing ticket
    const toAddress = typeof to === 'string' ? to : (Array.isArray(to) ? to[0] : to?.address || to?.email || '')
    const ticketNumber = parseTicketReplyAddress(toAddress)

    if (ticketNumber) {
      return await handleTicketReply(ticketNumber, senderEmail, senderName, emailBody, subject)
    }

    // Match sender to a venue contact
    let venueId: string | null = null
    let venueName = 'Unknown Venue'
    let channelId = ''
    let matchMethod = ''

    // 1. Try exact email match on primary_contact_email
    const venueResult = await query(
      `SELECT id, name, slack_channel_id FROM venues WHERE primary_contact_email ILIKE $1 LIMIT 1`,
      [senderEmail]
    )

    if (venueResult.rows.length > 0) {
      venueId = venueResult.rows[0].id
      venueName = venueResult.rows[0].name
      channelId = venueResult.rows[0].slack_channel_id || ''
      matchMethod = 'primary contact email'
    }

    // 2. Try match on distribution_emails array
    if (!venueId) {
      const distResult = await query(
        `SELECT id, name, slack_channel_id FROM venues WHERE $1 = ANY(distribution_emails) LIMIT 1`,
        [senderEmail.toLowerCase()]
      )
      if (distResult.rows.length > 0) {
        venueId = distResult.rows[0].id
        venueName = distResult.rows[0].name
        channelId = distResult.rows[0].slack_channel_id || ''
        matchMethod = 'distribution list'
      }
    }

    // 3. Try domain match on primary_contact_email
    if (!venueId) {
      const domain = senderEmail.split('@')[1]
      // Skip generic email providers — domain match only makes sense for company domains
      const genericDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com']
      if (domain && !genericDomains.includes(domain.toLowerCase())) {
        const domainResult = await query(
          `SELECT id, name, slack_channel_id FROM venues WHERE primary_contact_email ILIKE $1 LIMIT 1`,
          [`%@${domain}`]
        )
        if (domainResult.rows.length > 0) {
          venueId = domainResult.rows[0].id
          venueName = domainResult.rows[0].name
          channelId = domainResult.rows[0].slack_channel_id || ''
          matchMethod = 'domain match'
        }
      }
    }

    // 4. No match — notify Slack and skip ticket creation
    if (!venueId) {
      const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
      if (slackChannel) {
        await sendSlackMessage({
          channel: slackChannel,
          text: `⚠️ Inbound email from unknown sender: ${senderEmail}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `⚠️ *Inbound email — no venue match*` } },
            { type: 'section', fields: [
              { type: 'mrkdwn', text: `*From:*\n${senderName} (${senderEmail})` },
              { type: 'mrkdwn', text: `*Subject:*\n${subject}` },
            ]},
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Could not match sender to any venue. Add their email to a venue's contact or distribution list to auto-route future emails.` }] },
          ],
        })
      }
      console.warn(`[email-webhook] No venue match for sender: ${senderEmail}`)
      return NextResponse.json({ ok: true, message: 'No venue matched — notification sent' })
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
       VALUES ($1, $2, $3, 'general', 'medium', 'new', $4, $5, $6, $7, $8)
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
              { type: 'mrkdwn', text: `*Status:*\nnew` },
            ],
          },
          ...(emailBody ? [
            { type: 'divider' },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `💬 *Email body:* _"${emailBody.substring(0, 300)}${emailBody.length > 300 ? '...' : ''}"_` }] },
          ] : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `⏱️ *SLA Response due in ${sla?.response_hours || 4}h* | _Auto-created from inbound email (matched via ${matchMethod})_` }],
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

/**
 * Handle an email reply to an existing ticket — add as external comment.
 */
async function handleTicketReply(ticketNumber: number, senderEmail: string, senderName: string, emailBody: string, subject: string) {
  try {
    // Find the ticket
    const ticketRes = await query(
      `SELECT t.id, t.title, t.ticket_number, t.venue_id, v.name as venue_name, v.slack_channel_id
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       WHERE t.ticket_number = $1`,
      [ticketNumber]
    )

    if (ticketRes.rows.length === 0) {
      console.warn(`[email-webhook] Ticket reply for #${ticketNumber} — ticket not found`)
      return NextResponse.json({ ok: true, message: 'Ticket not found' })
    }

    const ticket = ticketRes.rows[0]
    const cleanBody = cleanEmailReply(emailBody || subject)

    if (!cleanBody) {
      return NextResponse.json({ ok: true, message: 'Empty reply body after cleanup' })
    }

    // Add as external comment
    const commentBody = `**Email reply from ${senderName} (${senderEmail}):**\n\n${cleanBody}`
    await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [ticket.id, CLAW_STAFF_ID, commentBody]
    )

    // Track SLA first response if this is from an external party
    await query(
      `UPDATE tickets SET first_response_at = NOW(), sla_response_met = (NOW() <= sla_response_due), updated_at = NOW()
       WHERE id = $1 AND first_response_at IS NULL`,
      [ticket.id]
    )

    // Slack notification to venue channel
    const caseNum = String(ticket.ticket_number).padStart(8, '0')
    const channelId = ticket.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const ticketUrl = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${ticket.id}`
      await sendSlackMessage({
        channel: channelId,
        text: `📧 Email reply on Case #${caseNum} from ${senderName}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `📧 *Case #${caseNum} — Email Reply*\n*${ticket.title}*` } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*From:*\n${senderName} (${senderEmail})` },
            { type: 'mrkdwn', text: `*Venue:*\n${ticket.venue_name}` },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: `> ${cleanBody.substring(0, 300)}${cleanBody.length > 300 ? '...' : ''}` } },
          { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
        ],
      })
    }

    console.log(`[email-webhook] Reply added to ticket #${ticketNumber} from ${senderEmail}`)
    return NextResponse.json({
      ok: true,
      action: 'comment_added',
      ticket_number: ticketNumber,
    })
  } catch (err) {
    console.error('Error handling ticket reply:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
