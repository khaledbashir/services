import { query } from '@/lib/db'

const RESEND_API_URL = 'https://api.resend.com/emails'

// Domain config — set EMAIL_DOMAIN env var to change (default: ancsports.net)
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'ancsports.net'
const FROM_ADDRESS = process.env.EMAIL_FROM || `ANC Services <notifications@${EMAIL_DOMAIN}>`
const REPLY_DOMAIN = EMAIL_DOMAIN

/**
 * Send an email via Resend. Returns true on success, false on failure.
 */
export async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  replyTo?: string,
  opts?: { cc?: string[]; bcc?: string[] }
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email')
    return false
  }

  if (!to || to.length === 0) return false

  try {
    const payload: any = { from: FROM_ADDRESS, to, subject, html }
    if (replyTo) payload.reply_to = replyTo
    if (opts?.cc && opts.cc.length > 0) payload.cc = opts.cc
    if (opts?.bcc && opts.bcc.length > 0) payload.bcc = opts.bcc

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[email] Resend API error ${res.status}: ${body}`)
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
export function ticketReplyAddress(ticketNumber: number): string {
  const caseNum = String(ticketNumber).padStart(8, '0')
  return `ticket+${caseNum}@${REPLY_DOMAIN}`
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

  let bodyContent = ''
  if (opts.type === 'created') {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>New Ticket Created</strong></p>
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px">${opts.detail}</p>`
  } else if (opts.type === 'comment') {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>New Comment:</strong></p>
      <p style="margin:0 0 12px;font-size:14px;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px">${opts.detail}</p>`
  } else {
    bodyContent = `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>Update:</strong> ${opts.detail}</p>
      ${opts.resolution ? `<p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>Resolution:</strong> ${opts.resolution}</p>` : ''}`
  }

  try {
    const ok = await sendEmail(
      venue.distribution_emails,
      subjectMap[opts.type],
      ticketEmailHtml(caseNum, opts.ticketTitle, venue.name, bodyContent),
      replyTo
    )
    if (ok === false) {
      return { sent: false, recipient_count: venue.distribution_emails.length, reason: 'send_failed' }
    }
    return { sent: true, recipient_count: venue.distribution_emails.length }
  } catch (e) {
    return { sent: false, recipient_count: venue.distribution_emails.length, reason: 'send_failed' }
  }
}

export async function sendTicketReplyEmail(opts: {
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
