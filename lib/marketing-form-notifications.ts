import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { notifyOps } from '@/lib/slack'
import { escapeHtml } from '@/lib/marketing'
import { evaluateMarketingEligibility, upsertMarketingEligibility } from '@/lib/marketing-sync'
import { twentyClient } from '@/lib/twenty-client'
import { randomUUID } from 'crypto'

type FieldValue = string | number | boolean | null | undefined

type NotifyInput = {
  formId: string
  formTitle: string
  inquiryType?: string | null
  submitterName?: string | null
  submitterEmail?: string | null
  companyName?: string | null
  subject?: string | null
  summaryFields?: Record<string, FieldValue>
  crmTargetUrl?: string | null
  sourceUrl?: string | null
  rawSubmission?: Record<string, unknown>
}

function text(value: unknown): string {
  return String(value || '').trim()
}

function cleanEmail(value: unknown): string | null {
  const email = text(value).toLowerCase()
  return email && email.includes('@') ? email : null
}

function splitName(value?: string | null): { firstName: string | null; lastName: string | null } {
  const parts = text(value).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

async function resolveRoute(formId: string, inquiryType?: string | null) {
  const result = await query(
    `SELECT *
     FROM marketing_form_routing_rules
     WHERE is_active = true
       AND (
         form_id = $1
         OR LOWER(form_title) = LOWER($2)
       )
     ORDER BY
       CASE
         WHEN COALESCE(inquiry_type, '') = COALESCE($3, '') THEN 0
         WHEN inquiry_type IS NULL THEN 1
         ELSE 2
       END,
       updated_at DESC
     LIMIT 1`,
    [formId, formId, inquiryType || null],
  )
  return result.rows[0] || null
}

function buildNotificationHtml(input: NotifyInput, route: any): string {
  const rows = Object.entries(input.summaryFields || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ')
      return `<tr><td style="padding:6px 10px;color:#64748b;text-transform:capitalize">${escapeHtml(label)}</td><td style="padding:6px 10px;color:#111827">${escapeHtml(String(value))}</td></tr>`
    })
    .join('')

  const links = [
    input.crmTargetUrl ? `<p><a href="${escapeHtml(input.crmTargetUrl)}" style="color:#0A52EF">Open CRM record</a></p>` : '',
    input.sourceUrl ? `<p><a href="${escapeHtml(input.sourceUrl)}" style="color:#0A52EF">Open source page</a></p>` : '',
  ].join('')

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:94%;background:#fff;border:1px solid #e5e7eb">
            <tr>
              <td style="background:#0b0b0d;color:#fff;padding:18px 22px;border-bottom:4px solid #e21b2d">
                <div style="font-size:18px;font-weight:700">New ${escapeHtml(input.formTitle)} submission</div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:4px">Routing: ${escapeHtml(route.route_to_name || route.route_to_email)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px;font-size:14px;line-height:1.5">
                <p style="margin:0 0 12px"><strong>Submitted by:</strong> ${escapeHtml(text(input.submitterName) || 'Unknown')}${input.submitterEmail ? ` (${escapeHtml(input.submitterEmail)})` : ''}</p>
                ${input.companyName ? `<p style="margin:0 0 12px"><strong>Company/client:</strong> ${escapeHtml(input.companyName)}</p>` : ''}
                ${rows ? `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e5e7eb">${rows}</table>` : ''}
                ${links}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function ensureCrmPerson(input: NotifyInput, email: string): Promise<string | null> {
  if (!twentyClient.isConfigured()) return null

  const existing = await twentyClient.findPersonByEmail(email)
  if (existing?.id) return existing.id

  const name = splitName(input.submitterName)
  const person = await twentyClient.createPerson({
    firstName: name.firstName || email.split('@')[0],
    lastName: name.lastName || '',
    email,
  })
  return person?.id || null
}

async function createCrmNote(input: NotifyInput, crmPersonId: string): Promise<string | null> {
  if (!twentyClient.isConfigured()) return null

  const lines = [
    `Live form submission: ${input.formTitle}`,
    input.inquiryType ? `Inquiry type: ${input.inquiryType}` : null,
    input.submitterName || input.submitterEmail ? `Submitted by: ${input.submitterName || 'Unknown'}${input.submitterEmail ? ` (${input.submitterEmail})` : ''}` : null,
    input.companyName ? `Company/client: ${input.companyName}` : null,
    input.sourceUrl ? `Source page: ${input.sourceUrl}` : null,
    input.crmTargetUrl ? `Related record: ${input.crmTargetUrl}` : null,
    '',
    ...Object.entries(input.summaryFields || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .slice(0, 30)
      .map(([key, value]) => `- ${key}: ${value}`),
  ].filter(Boolean).join('\n')

  const note = await twentyClient.createNote({
    title: `Form submission: ${input.formTitle}`,
    bodyMarkdown: lines,
  })
  await twentyClient.createNoteTarget({ noteId: note.id, personId: crmPersonId })
  return note.id
}

async function recordFormSubmission(input: NotifyInput, ids: {
  marketingContactId?: string
  crmPersonId?: string | null
  crmNoteId?: string | null
  timelineStatus: string
}) {
  const raw = input.rawSubmission || {}
  const sourceId = String(
    (raw as Record<string, unknown>).sourceId ||
    (raw as Record<string, unknown>).submissionId ||
    (raw as Record<string, unknown>).crmRecordId ||
    randomUUID(),
  )
  const name = splitName(input.submitterName)
  const result = await query(
    `INSERT INTO marketing_form_submissions
      (source, source_id, form_id, form_title, submitted_at, email, first_name, last_name,
       company_name, page_url, contact_id, crm_person_id, crm_note_id, timeline_status, fields, raw)
     VALUES ('live_form', $1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
     ON CONFLICT (source_id) DO UPDATE
       SET contact_id = COALESCE(EXCLUDED.contact_id, marketing_form_submissions.contact_id),
           crm_person_id = COALESCE(EXCLUDED.crm_person_id, marketing_form_submissions.crm_person_id),
           crm_note_id = COALESCE(EXCLUDED.crm_note_id, marketing_form_submissions.crm_note_id),
           timeline_status = EXCLUDED.timeline_status,
           fields = marketing_form_submissions.fields || EXCLUDED.fields,
           raw = marketing_form_submissions.raw || EXCLUDED.raw,
           updated_at = NOW()
     RETURNING id`,
    [
      sourceId,
      input.formId,
      input.formTitle,
      cleanEmail(input.submitterEmail),
      name.firstName,
      name.lastName,
      input.companyName || null,
      input.sourceUrl || null,
      ids.marketingContactId || null,
      ids.crmPersonId || null,
      ids.crmNoteId || null,
      ids.timelineStatus,
      JSON.stringify(input.summaryFields || {}),
      JSON.stringify(raw),
    ],
  )
  return result.rows[0]?.id as string | undefined
}

export async function notifyMarketingFormSubmission(input: NotifyInput): Promise<{
  routeFound: boolean
  emailSent: boolean
  slackSent: boolean
  marketingContactId?: string
  submissionId?: string
  crmPersonId?: string | null
  crmNoteId?: string | null
  timelineStatus?: string
}> {
  let marketingContactId: string | undefined
  let crmPersonId: string | null = null
  let crmNoteId: string | null = null
  let timelineStatus = 'received'

  const submitterEmail = cleanEmail(input.submitterEmail)
  if (submitterEmail) {
    const evaluated = evaluateMarketingEligibility(
      {
        id: input.rawSubmission?.crmPersonId || null,
        emails: { primaryEmail: submitterEmail },
        name: {
          firstName: text(input.submitterName).split(/\s+/)[0] || null,
          lastName: text(input.submitterName).split(/\s+/).slice(1).join(' ') || null,
        },
        companyName: input.companyName || null,
        source: 'form_submission',
        metadata: input.rawSubmission || {},
      },
      'form_submission',
    )
    if (evaluated) {
      const contact = await upsertMarketingEligibility(evaluated)
      marketingContactId = contact.contactId
    }

    try {
      crmPersonId = await ensureCrmPerson(input, submitterEmail)
      if (crmPersonId && marketingContactId) {
        await query(
          `UPDATE marketing_contacts
           SET crm_person_id = COALESCE(crm_person_id, $2), updated_at = NOW()
           WHERE id = $1`,
          [marketingContactId, crmPersonId],
        )
      }
    } catch (err) {
      timelineStatus = 'crm_person_failed'
      console.error('Marketing form CRM person sync failed:', err)
    }

    if (crmPersonId) {
      try {
        crmNoteId = await createCrmNote(input, crmPersonId)
        if (crmNoteId) timelineStatus = 'crm_note_created'
      } catch (err) {
        timelineStatus = 'crm_note_failed'
        console.error('Marketing form CRM note failed:', err)
      }
    }
  }

  const submissionId = await recordFormSubmission(input, {
    marketingContactId,
    crmPersonId,
    crmNoteId,
    timelineStatus,
  })

  const route = await resolveRoute(input.formId, input.inquiryType)
  if (!route) return { routeFound: false, emailSent: false, slackSent: false, marketingContactId, submissionId, crmPersonId, crmNoteId, timelineStatus }

  const subject = input.subject || `[ANC Forms] New ${input.formTitle} submission`
  const html = buildNotificationHtml(input, route)
  const emailSent = await sendEmail([route.route_to_email], subject, html, submitterEmail || undefined)

  let slackSent = false
  if (route.slack_channel) {
    const summary = [
      `New *${input.formTitle}* submission routed to ${route.route_to_name}.`,
      input.submitterName || input.submitterEmail ? `From: ${input.submitterName || 'Unknown'}${input.submitterEmail ? ` (${input.submitterEmail})` : ''}` : null,
      input.companyName ? `Company: ${input.companyName}` : null,
      input.crmTargetUrl ? `<${input.crmTargetUrl}|Open CRM record>` : null,
    ].filter(Boolean).join('\n')
    slackSent = await notifyOps(':incoming_envelope:', summary, undefined, route.slack_channel)
  }

  return { routeFound: true, emailSent, slackSent, marketingContactId, submissionId, crmPersonId, crmNoteId, timelineStatus }
}
