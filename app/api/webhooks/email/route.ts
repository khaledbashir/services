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
  if (!body) return ''
  const lines = body.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    // Stop at quoted text markers
    if (line.match(/^On .+ wrote:$/)) break
    if (line.match(/^-{3,}$/)) break
    if (line.match(/^_{3,}$/)) break
    if (line.match(/^From:/i)) break
    if (line.match(/^Sent:/i)) break
    // Stop at common signature markers
    if (line.trim() === '--') break
    if (line.match(/^Get Outlook for/i)) break
    if (line.match(/^Sent from my/i)) break
    // Skip quoted lines (but don't stop — there might be content after)
    if (line.match(/^>+ /)) continue
    cleaned.push(line)
  }
  const result = cleaned.join('\n').trim()
  // If stripping removed everything, fall back to the raw body (first 500 chars)
  if (!result && body.trim()) {
    return body.replace(/<[^>]*>/g, '').trim().substring(0, 500)
  }
  return result
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

    // Webhook payload does NOT include email body — must fetch via Receiving API
    let emailBody = data.text || data.body || ''

    if (emailId && RESEND_API_KEY && !emailBody) {
      try {
        // Use the Receiving API endpoint (not /emails/{id} which is for outbound only)
        const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
        })
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          emailBody = emailData.text || emailData.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || ''
          console.log(`[email-webhook] Fetched email body (${emailBody.length} chars) via Receiving API`)
        } else {
          console.error(`[email-webhook] Receiving API returned ${emailRes.status} for email ${emailId}`)
        }
      } catch (e) {
        console.error('[email-webhook] Failed to fetch email body from Resend:', e)
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

    // 3. Try domain match on primary_contact_email or distribution_emails
    const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || ''
    const genericDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com', 'anc.com']
    if (!venueId && senderDomain && !genericDomains.includes(senderDomain)) {
      const domainResult = await query(
        `SELECT id, name, slack_channel_id FROM venues
         WHERE primary_contact_email ILIKE $1
            OR EXISTS (SELECT 1 FROM unnest(distribution_emails) AS e WHERE e ILIKE $1)
         LIMIT 1`,
        [`%@${senderDomain}`]
      )
      if (domainResult.rows.length > 0) {
        venueId = domainResult.rows[0].id
        venueName = domainResult.rows[0].name
        channelId = domainResult.rows[0].slack_channel_id || ''
        matchMethod = 'domain match'
      }
    }

    // 4. Fuzzy match — check if the email domain contains a venue name or vice versa
    //    e.g. "orlandomagic.com" won't match "Kia Center" but "prucenter.com" matches "Prudential Center"
    if (!venueId && senderDomain && !genericDomains.includes(senderDomain)) {
      const domainBase = senderDomain.split('.')[0].toLowerCase() // e.g. "orlandomagic", "prucenter"
      if (domainBase.length >= 4) {
        const fuzzyResult = await query(
          `SELECT id, name, slack_channel_id FROM venues
           WHERE LOWER(REPLACE(REPLACE(name, ' ', ''), '-', '')) LIKE '%' || $1 || '%'
              OR $1 LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(name, ' ', ''), '-', ''), 'The ', ''), 'Center', '')) || '%'
           LIMIT 1`,
          [domainBase]
        )
        if (fuzzyResult.rows.length > 0) {
          venueId = fuzzyResult.rows[0].id
          venueName = fuzzyResult.rows[0].name
          channelId = fuzzyResult.rows[0].slack_channel_id || ''
          matchMethod = 'fuzzy domain match'
        }
      }
    }

    // 5. No match — auto-create venue from domain
    if (!venueId && senderDomain && !genericDomains.includes(senderDomain)) {
      // Derive venue name from domain: "wmata.com" → "WMATA", "orlandomagic.com" → "Orlando Magic"
      const domainBase = senderDomain.split('.')[0]
      // Smart name: split camelCase and add spaces, uppercase abbreviations
      let venueName_ = domainBase
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → spaces
        .replace(/([A-Z]+)/g, (m) => m.length <= 4 ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()) // Short = acronym, long = capitalize
        .trim()
      if (venueName_.length <= 5) venueName_ = venueName_.toUpperCase() // Short domains are usually acronyms

      // Determine type from domain/subject
      const context = `${senderDomain} ${subject}`.toLowerCase()
      let vtype = 'sports'
      if (/transit|metro|mta|rail|bus|transport|airport|station|dot\b/.test(context)) vtype = 'ooh'
      else if (/university|college|school|edu/.test(context)) vtype = 'facility'
      else if (/media|outdoor|billboard|sign|display|digital/.test(context)) vtype = 'ooh'

      const newVenue = await query(
        `INSERT INTO venues (name, venue_type, requires_assignment, portal_token, distribution_emails)
         VALUES ($1, $2, false, encode(gen_random_bytes(16), 'hex'), ARRAY[$3::text])
         RETURNING id, name`,
        [venueName_, vtype, senderEmail.toLowerCase()]
      )
      if (newVenue.rows.length > 0) {
        venueId = newVenue.rows[0].id
        venueName = newVenue.rows[0].name
        matchMethod = 'auto-created from domain'
        console.log(`[email-webhook] Auto-created venue "${venueName_}" (${vtype}) from domain ${senderDomain}`)
      }
    }

    // Auto-learn: if we matched by domain or fuzzy, add sender to distribution list for faster future matches
    if (venueId && (matchMethod === 'domain match' || matchMethod === 'fuzzy domain match')) {
      await query(
        `UPDATE venues SET distribution_emails = array_append(COALESCE(distribution_emails, '{}'), $1)
         WHERE id = $2 AND NOT ($1 = ANY(COALESCE(distribution_emails, '{}')))`,
        [senderEmail.toLowerCase(), venueId]
      )
      console.log(`[email-webhook] Auto-added ${senderEmail} to ${venueName} distribution list (${matchMethod})`)
    }

    // SLA + auto-assignment (works for matched and unmatched)
    const slaResult = await query(`SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = 'medium' LIMIT 1`)
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    let autoAssign: string | null = null
    if (venueId) {
      const ruleResult = await query(
        `SELECT assign_to FROM assignment_rules WHERE is_active = true
         AND (category IS NULL OR category = 'general') AND (venue_id IS NULL OR venue_id = $1)
         ORDER BY CASE WHEN venue_id IS NOT NULL THEN 1 ELSE 2 END LIMIT 1`,
        [venueId]
      )
      autoAssign = ruleResult.rows[0]?.assign_to || null
    }

    // Always create ticket — matched or not
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
    const caseNum = String(ticket.ticket_number).padStart(8, '0')

    // 5. Unmatched — Slack warning with email body + ticket link (ticket was still created)
    if (!venueId) {
      const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
      if (slackChannel) {
        const bodyPreview = emailBody ? `\n\n> ${emailBody.substring(0, 300).replace(/\n/g, '\n> ')}${emailBody.length > 300 ? '...' : ''}` : ''
        const ticketUrl = `${process.env.NEXT_PUBLIC_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/tickets/${ticket.id}`
        await sendSlackMessage({
          channel: slackChannel,
          text: `⚠️ Inbound email from unknown sender: ${senderEmail} — ticket #${caseNum} created`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `⚠️ *Inbound email — no venue match* (ticket created anyway)` } },
            { type: 'section', fields: [
              { type: 'mrkdwn', text: `*From:*\n${senderName} (${senderEmail})` },
              { type: 'mrkdwn', text: `*Subject:*\n${subject}` },
            ]},
            ...(emailBody ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Message:*${bodyPreview}` } }] : []),
            { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket #${caseNum}>` } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Domain: \`${senderDomain}\` — assign this ticket to a venue to auto-route future emails from this domain.` }] },
          ],
        })
      }
      console.warn(`[email-webhook] No venue match for ${senderEmail} — ticket #${caseNum} created without venue`)
      return NextResponse.json({ ok: true, ticket_number: ticket.ticket_number, venue: null, message: 'Ticket created without venue match' })
    }

    // Slack notification for matched venue
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
            type: 'section',
            text: { type: 'mrkdwn', text: `<${process.env.NEXT_PUBLIC_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/tickets/${ticket.id}|:link: View Ticket #${caseNum}>` },
          },
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
    console.log(`[email-webhook] Ticket reply raw body (${emailBody.length} chars): ${emailBody.substring(0, 200)}`)
    const cleanBody = cleanEmailReply(emailBody || subject)
    console.log(`[email-webhook] Cleaned body (${cleanBody.length} chars): ${cleanBody.substring(0, 200)}`)

    if (!cleanBody) {
      return NextResponse.json({ ok: true, message: 'Empty reply body after cleanup' })
    }

    // Add as external comment
    const commentBody = cleanBody
    await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [ticket.id, CLAW_STAFF_ID, commentBody]
    )

    // Log to activity
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('email_reply', 'ticket', $1, $2, $3)`,
      [ticket.id, CLAW_STAFF_ID, JSON.stringify({
        entity_name: ticket.title,
        venue_name: ticket.venue_name,
        from: `${senderName} (${senderEmail})`,
      })]
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
