import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'

// Outbound notifications to the PORTAL CUSTOMER on a ticket (the requester),
// distinct from the internal distribution list. Fire-and-forget: callers
// must .catch() — a mail failure must never break the staff action.

const PORTAL_BASE = process.env.PORTAL_PUBLIC_URL || 'https://services.ancsports.net'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function emailShell(title: string, intro: string, content: string, ctaUrl: string) {
  return `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:'Inter',-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#0A1628;padding:20px 28px">
        <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.04em">ANC</span>
        <span style="color:#94a3b8;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin-left:10px">Customer Portal</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:18px;color:#0f172a">${title}</h1>
        <p style="margin:0 0 18px;font-size:13px;color:#64748b">${intro}</p>
        ${content}
        <a href="${ctaUrl}" style="display:inline-block;margin-top:22px;background:#0A52EF;color:#ffffff;font-size:14px;font-weight:600;padding:11px 22px;border-radius:6px;text-decoration:none">View in portal</a>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
        You're receiving this because you have a service account with ANC. Sign in at ${PORTAL_BASE.replace('https://', '')}/customer
      </div>
    </div>
  </div>`
}

interface TicketRow {
  id: string
  ticket_number: number
  title: string
  status: string
  resolution_notes: string | null
  contact_email: string | null
  source: string | null
  venue_name: string
}

async function loadTicket(ticketId: string): Promise<TicketRow | null> {
  const result = await query(
    `SELECT t.id, t.ticket_number, t.title, t.status, t.resolution_notes,
            t.contact_email, t.source, v.name AS venue_name
     FROM tickets t JOIN venues v ON v.id = t.venue_id
     WHERE t.id = $1`,
    [ticketId]
  )
  return result.rows[0] || null
}

/**
 * The customer recipient for a ticket: the requester's contact_email when the
 * ticket came in through the portal, or any active portal account matching
 * contact_email otherwise. Returns null when there is no customer to notify
 * (internal tickets, no email on file).
 */
async function resolveRecipient(t: TicketRow): Promise<string | null> {
  if (!t.contact_email) return null
  if (t.source && t.source.startsWith('customer_portal')) return t.contact_email
  const pu = await query(
    `SELECT email FROM portal_users WHERE LOWER(email) = LOWER($1) AND is_active = true`,
    [t.contact_email]
  )
  return pu.rows.length > 0 ? pu.rows[0].email : null
}

export async function notifyCustomerReply(params: {
  ticketId: string
  body: string
  authorName: string
}): Promise<void> {
  const t = await loadTicket(params.ticketId)
  if (!t) return
  const to = await resolveRecipient(t)
  if (!to) return

  const caseNum = String(t.ticket_number).padStart(8, '0')
  const html = emailShell(
    'New reply on your request',
    `Case #${caseNum} · ${escapeHtml(t.venue_name)}`,
    `<div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:10px">${escapeHtml(t.title)}</div>
     <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;font-size:14px;color:#334155;line-height:1.6">
       <div style="font-size:12px;color:#64748b;margin-bottom:6px">${escapeHtml(params.authorName)} — ANC Support</div>
       ${escapeHtml(params.body).replace(/\n/g, '<br/>')}
     </div>`,
    `${PORTAL_BASE}/customer/tickets/${t.id}`
  )

  const sent = await sendEmail([to], `New reply on Case #${caseNum} — ${t.title}`, html)
  console.log(`[customer-notify] reply email ${sent ? 'sent' : 'NOT sent'} to ${to} for #${caseNum}`)
}

export async function notifyCustomerStatus(params: { ticketId: string }): Promise<void> {
  const t = await loadTicket(params.ticketId)
  if (!t) return
  if (t.status !== 'resolved' && t.status !== 'closed') return
  const to = await resolveRecipient(t)
  if (!to) return

  const caseNum = String(t.ticket_number).padStart(8, '0')
  const html = emailShell(
    'Your request has been resolved',
    `Case #${caseNum} · ${escapeHtml(t.venue_name)}`,
    `<div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:10px">${escapeHtml(t.title)}</div>
     ${t.resolution_notes
       ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px;font-size:14px;color:#166534;line-height:1.6">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px">Resolution</div>
            ${escapeHtml(t.resolution_notes).replace(/\n/g, '<br/>')}
          </div>`
       : `<p style="font-size:14px;color:#334155">The ANC team has marked this request as ${escapeHtml(t.status)}. If anything still isn't right, reply on the thread and it reopens the conversation.</p>`}`,
    `${PORTAL_BASE}/customer/tickets/${t.id}`
  )

  const sent = await sendEmail([to], `Resolved: Case #${caseNum} — ${t.title}`, html)
  console.log(`[customer-notify] status email ${sent ? 'sent' : 'NOT sent'} to ${to} for #${caseNum}`)
}
