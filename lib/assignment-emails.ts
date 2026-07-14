import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'

/**
 * Assignment notification emails — when a staff member is assigned to a design
 * request, CG design request, or content schedule, they get a branded email
 * with a link straight to the ticket. (Charlie 2026-07-14, item #8.)
 *
 * Best-effort + fire-and-forget: callers invoke without awaiting and attach a
 * .catch — a mail failure must never block or break the mutation it describes.
 */

export type AssignmentKind = 'design' | 'cg' | 'content'

export interface AssignmentEmailInput {
  kind: AssignmentKind
  recordId: string
  /** Ticket title; resolved from the DB when omitted. */
  recordTitle?: string | null
  /** Client / venue label; resolved from the DB when omitted. */
  client?: string | null
  /** Due date (design/cg) or launch date (content); resolved when omitted. */
  dueDate?: string | Date | null
  /** Staff ids to notify — emails are resolved from the staff table. */
  assigneeUserIds?: Array<string | null | undefined>
  /** Explicit recipient emails (used when no staff id is available). */
  assigneeEmails?: Array<string | null | undefined>
  assignedByName?: string | null
  /** The actor — used to skip self-assignments. */
  assignedByUserId?: string | null
  assignedByEmail?: string | null
}

export interface AssignmentEmailSummary {
  target_count: number
  sent_count: number
  skipped_count: number
}

type KindConfig = {
  label: string
  subjectPrefix: string
  dateLabel: string
  path: (id: string) => string
}

const KIND_CONFIG: Record<AssignmentKind, KindConfig> = {
  design: {
    label: 'design request',
    subjectPrefix: 'New design assignment',
    dateLabel: 'Due date',
    path: (id) => `/designs/${id}`,
  },
  cg: {
    label: 'CG design request',
    subjectPrefix: 'New CG design assignment',
    dateLabel: 'Due date',
    path: (id) => `/cg-designs/${id}`,
  },
  content: {
    label: 'content schedule',
    subjectPrefix: 'New content schedule assignment',
    dateLabel: 'Launch date',
    path: (id) => `/content-schedules/${id}`,
  },
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://services.ancsports.net'
  ).replace(/\/+$/, '')
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

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Fill in title/client/date from the local record when the caller didn't pass them. */
async function fetchRecordContext(kind: AssignmentKind, recordId: string) {
  const sqlByKind: Record<AssignmentKind, string> = {
    design: `SELECT dr.job_title AS title, COALESCE(dr.company_name, v.name) AS client,
                    to_char(dr.due_date::date, 'YYYY-MM-DD') AS record_date
             FROM design_requests dr
             LEFT JOIN venues v ON dr.venue_id = v.id
             WHERE dr.id::text = $1`,
    cg: `SELECT cg.job_title AS title, COALESCE(cg.team_name, v.name) AS client,
                to_char(cg.due_date::date, 'YYYY-MM-DD') AS record_date
         FROM cg_design_requests cg
         LEFT JOIN venues v ON cg.venue_id = v.id
         WHERE cg.id::text = $1`,
    content: `SELECT cs.content_name AS title, COALESCE(cs.company_name, v.name) AS client,
                     to_char(cs.launch_date::date, 'YYYY-MM-DD') AS record_date
              FROM content_schedules cs
              LEFT JOIN venues v ON cs.venue_id = v.id
              WHERE cs.id::text = $1`,
  }
  try {
    const result = await query(sqlByKind[kind], [recordId])
    const row = result.rows[0]
    return {
      title: (row?.title as string | null) || null,
      client: (row?.client as string | null) || null,
      recordDate: (row?.record_date as string | null) || null,
    }
  } catch {
    // Twenty-backed records may have no local mirror — fall back to caller values.
    return { title: null, client: null, recordDate: null }
  }
}

export async function sendAssignmentEmail(input: AssignmentEmailInput): Promise<AssignmentEmailSummary> {
  const summary: AssignmentEmailSummary = { target_count: 0, sent_count: 0, skipped_count: 0 }
  try {
    const config = KIND_CONFIG[input.kind]
    const assigneeIds = Array.from(
      new Set(
        (input.assigneeUserIds || []).filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        ),
      ),
    )

    const recipients: Array<{ id: string | null; name: string | null; email: string }> = []
    if (assigneeIds.length) {
      const staff = await query(
        `SELECT id::text AS id, full_name, email
         FROM staff
         WHERE id::text = ANY($1::text[])
           AND COALESCE(is_active, true) = true`,
        [assigneeIds],
      )
      for (const person of staff.rows) {
        recipients.push({ id: person.id, name: person.full_name || null, email: (person.email || '').trim() })
      }
    }
    for (const email of input.assigneeEmails || []) {
      if (typeof email === 'string' && email.includes('@')) {
        recipients.push({ id: null, name: null, email: email.trim() })
      }
    }

    const actorId = input.assignedByUserId ? String(input.assignedByUserId) : null
    const actorEmail = input.assignedByEmail ? input.assignedByEmail.trim().toLowerCase() : null
    const seen = new Set<string>()
    const targets = recipients.filter((recipient) => {
      // No email on file — nothing to send.
      if (!recipient.email || !recipient.email.includes('@')) return false
      const emailKey = recipient.email.toLowerCase()
      // Don't email the person doing the assigning about their own assignment.
      if (actorId && recipient.id && recipient.id === actorId) return false
      if (actorEmail && emailKey === actorEmail) return false
      if (seen.has(emailKey)) return false
      seen.add(emailKey)
      return true
    })

    summary.target_count = targets.length
    summary.skipped_count = recipients.length - targets.length
    if (!targets.length) return summary

    const needsContext = !input.recordTitle || input.client === undefined || input.dueDate === undefined
    const context = needsContext
      ? await fetchRecordContext(input.kind, input.recordId)
      : { title: null, client: null, recordDate: null }

    const title = input.recordTitle?.trim() || context.title || input.recordId
    const client = input.client !== undefined ? input.client : context.client
    const dateValue = input.dueDate !== undefined ? input.dueDate : context.recordDate
    const dateLabelValue = formatDate(dateValue)
    const assignedBy = input.assignedByName?.trim() || 'A team member'
    const url = `${appBaseUrl()}${config.path(input.recordId)}`
    const subject = `${config.subjectPrefix}: ${title}`

    const detailRows = [
      `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">Ticket</td><td style="padding:6px 0;font-weight:600">${escapeHtml(title)}</td></tr>`,
      client
        ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">Client</td><td style="padding:6px 0">${escapeHtml(client)}</td></tr>`
        : '',
      dateLabelValue
        ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">${config.dateLabel}</td><td style="padding:6px 0">${escapeHtml(dateLabelValue)}</td></tr>`
        : '',
    ].join('')

    for (const recipient of targets) {
      const firstName = (recipient.name || '').trim().split(/\s+/)[0] || 'there'
      const bodyHtml = `
        <p style="margin:0 0 14px">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px"><strong>${escapeHtml(assignedBy)}</strong> assigned you to a ${config.label}.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;margin:0 0 20px">${detailRows}</table>
        <a href="${url}" style="display:inline-block;background:#002C73;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">Open the ticket</a>
        <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">Or copy this link: ${url}</p>
      `
      const html = brandedEmail({
        title: 'New assignment',
        subtitle: `${escapeHtml(title)} · assigned by ${escapeHtml(assignedBy)}`,
        bodyHtml,
      })
      const ok = await sendEmail([recipient.email], subject, html)
      if (ok) summary.sent_count += 1
      else summary.skipped_count += 1
    }
    return summary
  } catch (err) {
    console.error('[assignment-email] failed to send assignment email:', err)
    return summary
  }
}
