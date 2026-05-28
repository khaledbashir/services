export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

/**
 * Create a draft newsletter campaign from a Compose canvas section.
 * Doesn't send — drops a draft into newsletter_campaigns so Alison (or the
 * approval flow) can review, pick an audience, and schedule the send.
 *
 * Reuses the existing marketing-hub send infrastructure
 * (SendGrid via lib/email.ts is already wired).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const text = String(body.text || '').trim()
  const subjectInput = String(body.subject || '').trim()

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Derive a subject + preview if not provided
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) || 'ANC Update'
  const subject = subjectInput || firstLine.slice(0, 120)
  const previewText = firstLine.slice(0, 180)

  // Wrap the section text in our shared brand-correct email shell
  const bodyHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body,table,td{font-family:Arial,Helvetica,sans-serif}a{color:#0A52EF}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff">
<tr><td style="padding:24px">
${text
  .split('\n\n')
  .map((p) => `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;color:#0d1422">${p.replace(/\n/g, '<br/>')}</p>`)
  .join('')}
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const result = await query(
    `INSERT INTO newsletter_campaigns (name, subject, preview_text, body_html, status, source)
     VALUES ($1, $2, $3, $4, 'draft', $5)
     RETURNING id`,
    [
      `Signal — ${subject.slice(0, 80)}`,
      subject,
      previewText,
      bodyHtml,
      'signal_compose',
    ],
  ).catch(async (err) => {
    // Fall back if the source column doesn't exist on this schema
    return query(
      `INSERT INTO newsletter_campaigns (name, subject, preview_text, body_html, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id`,
      [`Signal — ${subject.slice(0, 80)}`, subject, previewText, bodyHtml],
    )
  })

  const campaignId = (result.rows[0] as { id: string }).id

  return NextResponse.json({
    ok: true,
    campaignId,
    next: `/marketing-hub#campaign-${campaignId}`,
    message: 'Draft created. Pick an audience + schedule in Marketing Hub.',
  })
}
