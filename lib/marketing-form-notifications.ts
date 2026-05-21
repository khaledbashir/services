import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { notifyOps } from '@/lib/slack'
import { escapeHtml } from '@/lib/marketing'
import { evaluateMarketingEligibility, upsertMarketingEligibility } from '@/lib/marketing-sync'

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

export async function notifyMarketingFormSubmission(input: NotifyInput): Promise<{
  routeFound: boolean
  emailSent: boolean
  slackSent: boolean
  marketingContactId?: string
}> {
  const route = await resolveRoute(input.formId, input.inquiryType)
  if (!route) return { routeFound: false, emailSent: false, slackSent: false }

  let marketingContactId: string | undefined
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
  }

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

  return { routeFound: true, emailSent, slackSent, marketingContactId }
}
