import { query } from '@/lib/db'
import { getSupportMailboxHandle } from '@/lib/crm-support-email'
import { ticketUpdateByline } from '@/lib/ticket-update-byline'

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

// Domain config — set EMAIL_DOMAIN env var to change (default: ancsports.net)
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'ancsports.net'

/**
 * Resolve the From identity from env.
 * Prefers EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME (current setup); falls back to a
 * legacy "Name <email>" EMAIL_FROM string, then a sane default.
 */
function resolveFrom(): { email: string; name: string } {
  if (process.env.EMAIL_FROM_ADDRESS) {
    return { email: process.env.EMAIL_FROM_ADDRESS, name: process.env.EMAIL_FROM_NAME || 'ANC' }
  }
  const legacy = process.env.EMAIL_FROM
  if (legacy) {
    const m = legacy.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
    if (m) return { name: m[1] || 'ANC', email: m[2] }
    return { email: legacy, name: process.env.EMAIL_FROM_NAME || 'ANC' }
  }
  return { email: `notifications@${EMAIL_DOMAIN}`, name: 'ANC' }
}

/**
 * Send an email via SendGrid (v3 HTTP API). Returns true on success, false on failure.
 *
 * Marketing + transactional mail goes through SendGrid (Resend retired 2026-05).
 * CRM/support-mailbox + ticket emails go through Microsoft Graph — see lib/crm-support-email.ts.
 * The SendGrid key is provisioned as the SMTP password (SMTP user is the literal "apikey");
 * a dedicated SENDGRID_API_KEY is honored first if present. No new dependency — uses fetch.
 */
export async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  replyTo?: string,
  opts?: { cc?: string[]; bcc?: string[]; attachments?: { filename: string; content: string; type?: string }[]; from?: { email: string; name?: string } }
): Promise<boolean> {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || process.env.EMAIL_SMTP_PASSWORD || ''
  if (!SENDGRID_API_KEY) {
    console.warn('[email] SENDGRID_API_KEY / EMAIL_SMTP_PASSWORD not set — skipping email')
    return false
  }

  if (!to || to.length === 0) return false

  // Caller may override the From identity (e.g. ticket replies send from the
  // support mailbox). Only honor it when the address shares the authenticated
  // sending domain, otherwise SendGrid rejects it / it fails DMARC.
  const from = opts?.from?.email && opts.from.email.toLowerCase().endsWith(`@${resolveFrom().email.split('@')[1]}`)
    ? { email: opts.from.email, name: opts.from.name || resolveFrom().name }
    : resolveFrom()

  const personalization: any = { to: to.map((email) => ({ email })) }
  if (opts?.cc && opts.cc.length > 0) personalization.cc = opts.cc.map((email) => ({ email }))
  if (opts?.bcc && opts.bcc.length > 0) personalization.bcc = opts.bcc.map((email) => ({ email }))

  try {
    const payload: any = {
      personalizations: [personalization],
      from: { email: from.email, name: from.name },
      subject,
      content: [{ type: 'text/html', value: html }],
    }
    if (replyTo) payload.reply_to = { email: replyTo }
    if (opts?.attachments && opts.attachments.length > 0) {
      payload.attachments = opts.attachments.map((a) => ({
        content: a.content,
        filename: a.filename,
        type: a.type || 'application/octet-stream',
        disposition: 'attachment',
      }))
    }

    const res = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[email] SendGrid API error ${res.status}: ${body}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Failed to send:', err)
    return false
  }
}

/**
 * Build the standard ANC ticket email HTML template.
 */
function ticketEmailHtml(caseNum: string, title: string, venueName: string, bodyContent: string): string {
  return `<div style="font-family:sans-serif;max-width:600px">
    <div style="background:#002C73;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:16px">Case ${caseNum} — ${title}</h2>
      <p style="margin:4px 0 0;opacity:0.7;font-size:13px">${venueName}</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
      ${bodyContent}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="margin:0;font-size:12px;color:#94a3b8">Reply to this email to add a comment to this ticket.</p>
      <p style="margin:0;font-size:12px;color:#94a3b8">This is an automated notification from ANC Sports Operations.</p>
    </div>
  </div>`
}

/**
 * Send a customer-portal invite email with the personal invite link.
 * Returns true when SendGrid accepted the message.
 */
export async function sendPortalInviteEmail(opts: {
  to: string
  fullName: string
  clientName?: string | null
  inviteUrl: string
}): Promise<boolean> {
  const firstName = opts.fullName.trim().split(/\s+/)[0] || opts.fullName
  const orgLine = opts.clientName
    ? `<p style="margin:4px 0 0;opacity:0.7;font-size:13px">${escapeHtml(opts.clientName)}</p>`
    : ''
  const html = `<div style="font-family:sans-serif;max-width:600px">
    <div style="background:#002C73;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:16px">Your ANC Customer Portal access</h2>
      ${orgLine}
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;line-height:1.5">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;line-height:1.5">You've been given access to the ANC Customer Portal, where you can submit service requests, follow their status, and see updates from the ANC service team.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#1e293b;line-height:1.5">Use the button below to set your password and activate your account. This link is valid for 14 days.</p>
      <p style="margin:0 0 16px"><a href="${opts.inviteUrl}" style="display:inline-block;background:#0A52EF;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:8px">Activate your account</a></p>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.5">New to the portal? <a href="https://services.ancsports.net/orientation-videos/getting-started.mp4" style="color:#0A52EF">Watch the 30-second tour</a>.</p>
      <p style="margin:0 0 12px;font-size:12px;color:#64748b;line-height:1.5">If the button doesn't work, copy and paste this link into your browser:<br><a href="${opts.inviteUrl}" style="color:#0A52EF;word-break:break-all">${opts.inviteUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="margin:0;font-size:12px;color:#94a3b8">If you weren't expecting this invitation, you can ignore this email.</p>
      <p style="margin:0;font-size:12px;color:#94a3b8">ANC Sports + Entertainment</p>
    </div>
  </div>`
  return sendEmail([opts.to], 'Your ANC Customer Portal invitation', html)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function plainTextToHtml(value: string): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 12px;font-size:14px;color:#1e293b;line-height:1.5">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Generate the reply-to address for a ticket.
 */
export function ticketReplyAddress(_ticketNumber: number): string {
  // Replies MUST land in the actual monitored support mailbox so the inbound
  // webhook ingests them; the ticket is then resolved from the "Case NNNNNNNN"
  // token in the subject (see app/api/webhooks/email). This previously returned
  // ticket+NNNN@<EMAIL_DOMAIN> (ancsports.net) — a different mailbox AND domain
  // from the one we actually read (support@anc.com) — so client replies to
  // dashboard-created tickets were silently dropped and never threaded back.
  return getSupportMailboxHandle()
}

/**
 * Parse a ticket number from a reply-to address.
 * Returns ticket number or null if not a ticket reply.
 */
export function parseTicketReplyAddress(toAddress: string): number | null {
  const match = toAddress.match(/ticket\+0*(\d+)@/)
  if (match) return parseInt(match[1])
  return null
}

/**
 * Send distribution emails for a ticket event (created, updated, commented).
 */
export async function sendTicketDistributionEmail(opts: {
  venueId: string
  ticketTitle: string
  ticketNumber: number
  type: 'created' | 'updated' | 'comment'
  detail: string
  resolution?: string
  /** Who wrote the comment/update. Rendered beside the heading (Charlie 2026-08-10). */
  authorName?: string | null
  /** When it was written. Defaults to send time. */
  occurredAt?: Date | string | null
}): Promise<{ sent: boolean; recipient_count: number; reason?: 'no_list' | 'send_failed' }> {
  const venueRes = await query(
    `SELECT name, distribution_emails FROM venues WHERE id = $1`,
    [opts.venueId]
  )
  const venue = venueRes.rows[0]
  if (!venue?.distribution_emails || venue.distribution_emails.length === 0) {
    return { sent: false, recipient_count: 0, reason: 'no_list' }
  }

  const caseNum = String(opts.ticketNumber).padStart(8, '0')
  const replyTo = ticketReplyAddress(opts.ticketNumber)

  const subjectMap = {
    created: `Case ${caseNum} New — ${opts.ticketTitle}`,
    updated: `Case ${caseNum} Update — ${opts.ticketTitle}`,
    comment: `Case ${caseNum} Comment — ${opts.ticketTitle}`,
  }

  const byline = ticketUpdateByline(opts.authorName, opts.occurredAt)

  let bodyContent = ''
  if (opts.type === 'created') {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>New Ticket Created</strong>${byline}</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px">${opts.detail}</p>`
  } else if (opts.type === 'comment') {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>New Comment:</strong>${byline}</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px">${opts.detail}</p>`
  } else {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>Update:</strong>${byline} ${opts.detail}</p>
      ${opts.resolution ? `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>Resolution:</strong> ${opts.resolution}</p>` : ''}`
  }

  // Outbound ticket distribution goes through SendGrid (transactional).
  // replyTo is set to the monitored support mailbox so client replies thread
  // back into the support inbox via the inbound webhook (matched on the
  // "Case NNNNNNNN —" subject token, not the sender). This intentionally does
  // NOT send *from* the support mailbox: that path reads Twenty's encrypted
  // connectedAccount tokens (enc:v2:...) raw and cannot authenticate to Graph,
  // so every send silently failed (AADSTS9002313). SendGrid is decoupled from
  // Twenty's token store and is already the outbound transactional provider.
  const html = ticketEmailHtml(caseNum, opts.ticketTitle, venue.name, bodyContent)
  const ok = await sendEmail(
    venue.distribution_emails,
    subjectMap[opts.type],
    html,
    replyTo,
  )
  if (!ok) {
    console.error('[email] Ticket distribution send failed via SendGrid for case', caseNum)
    return { sent: false, recipient_count: venue.distribution_emails.length, reason: 'send_failed' }
  }
  return { sent: true, recipient_count: venue.distribution_emails.length }
}

/**
 * Send a ticket reply email to the client.
 *
 * Sends through SendGrid (the outbound transactional provider) as the support
 * mailbox, with reply-to also set to the support mailbox so client replies
 * thread back into the support inbox via the inbound webhook ("Case NNNNNNNN"
 * subject token). This does NOT go through Microsoft Graph: that path read
 * Twenty's encrypted connectedAccount tokens (enc:v2:...) raw and could not
 * authenticate, so every send failed with AADSTS9002313. SendGrid is decoupled
 * from Twenty's token store and the anc.com sending domain is authenticated,
 * so we can legitimately send as support@anc.com.
 */
export async function sendTicketReplyEmail(opts: {
  to: string | string[]
  ticketTitle: string
  ticketNumber: number
  venueName: string
  body: string
  authorName: string
  signature?: string | null
}): Promise<{ sent: boolean; from?: string; provider?: string; error?: string }> {
  const caseNum = String(opts.ticketNumber).padStart(8, '0')
  const supportMailbox = getSupportMailboxHandle()
  const replyTo = ticketReplyAddress(opts.ticketNumber)
  const toList = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((e) => String(e || '').trim())
    .filter((e) => e.includes('@'))
  // Per-tech signature: each technician sets their own in the dashboard; it is
  // appended here so their name/signature appears even though every reply is
  // sent from the shared support mailbox. Rendered safely (escaped + newlines).
  const sig = (opts.signature || '').trim()
  const signatureBlock = sig
    ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#334155">${plainTextToHtml(sig)}</div>`
    : ''
  const bodyContent = `
    <p style="margin:0 0 12px;font-size:13px;color:#64748b">Reply from ${escapeHtml(opts.authorName)}</p>
    <div style="background:#f8fafc;border-radius:6px;padding:12px">${plainTextToHtml(opts.body)}</div>
    ${signatureBlock}
  `

  const ok = await sendEmail(
    toList,
    `Re: Case ${caseNum} — ${opts.ticketTitle}`,
    ticketEmailHtml(caseNum, opts.ticketTitle, opts.venueName || 'ANC Support', bodyContent),
    replyTo,
    { from: { email: supportMailbox, name: 'ANC Support' } },
  )

  if (!ok) {
    return { sent: false, error: 'Email could not be sent' }
  }
  return { sent: true, from: supportMailbox, provider: 'sendgrid' }
}

export async function sendTicketReplyEmailViaResend(opts: {
  to: string
  ticketTitle: string
  ticketNumber: number
  venueName: string
  body: string
  authorName: string
}): Promise<boolean> {
  const caseNum = String(opts.ticketNumber).padStart(8, '0')
  const replyTo = ticketReplyAddress(opts.ticketNumber)
  const bodyContent = `
    <p style="margin:0 0 12px;font-size:13px;color:#64748b">Reply from ${escapeHtml(opts.authorName)}</p>
    <div style="background:#f8fafc;border-radius:6px;padding:12px">${plainTextToHtml(opts.body)}</div>
  `

  return sendEmail(
    [opts.to],
    `Re: Case ${caseNum} — ${opts.ticketTitle}`,
    ticketEmailHtml(caseNum, opts.ticketTitle, opts.venueName || 'ANC Support', bodyContent),
    replyTo
  )
}
