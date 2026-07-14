export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { getWeekEntries } from '@/lib/leadership-brief'

const PLATFORM_LABELS: Record<string, string> = {
  crm: 'The CRM',
  proposals: 'Proposal Engine',
  services: 'Service Dashboard',
  projects: 'Project Delivery',
  ops: 'Operations Tables',
  marketing: 'Marketing Hub',
  docs: 'Docs & Academy',
}

/**
 * GET /api/cron/leadership-digest
 *
 * Weekly. Emails Jireh, Joe, and Jerry everything that shipped across the
 * platforms in the last seven days — grouped by platform, in their language —
 * each with a link straight into their own hub. `?dry=1` renders without
 * sending, so the copy can be checked before it goes out.
 */
export async function GET(request: NextRequest) {
  try {
    const dryRun = request.nextUrl.searchParams.get('dry') === '1'
    const entries = await getWeekEntries(7)

    if (entries.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'nothing shipped this week' })
    }

    const grouped = new Map<string, typeof entries>()
    for (const entry of entries) {
      const key = entry.platform_key
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(entry)
    }

    const sections = Array.from(grouped.entries())
      .map(([key, items]) => {
        const rows = items
          .map(
            (item) => `<li style="margin:0 0 10px">
              <div style="font-weight:600;color:#111827">${escapeHtml(item.title)}</div>
              ${item.detail ? `<div style="color:#4b5563;margin-top:2px">${escapeHtml(item.detail)}</div>` : ''}
            </li>`
          )
          .join('')
        return `<div style="margin:0 0 22px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0A52EF;margin-bottom:8px">
            ${escapeHtml(PLATFORM_LABELS[key] || key)}
          </div>
          <ul style="margin:0;padding-left:18px">${rows}</ul>
        </div>`
      })
      .join('')

    const recipients = await query(
      `SELECT person_name, person_email, token
       FROM hub_access_tokens
       WHERE revoked_at IS NULL
         AND person_email IN ('jbillings@anc.com', 'joeo@anc.com', 'jerry@anc.com')`
    )

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net'
    let sent = 0
    const previews: string[] = []

    for (const person of recipients.rows) {
      const firstName = String(person.person_name || '').split(' ')[0]
      const html = brandedEmail({
        title: 'This week on the platforms',
        subtitle: `${entries.length} update${entries.length === 1 ? '' : 's'} across ANC — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
        bodyHtml: `
          <p style="margin:0 0 18px">${escapeHtml(firstName)} — here's what changed across the platforms this week.</p>
          ${sections}
          <p style="margin:22px 0 0">
            <a href="${baseUrl}/hub/${person.token}" style="display:inline-block;background:#0A52EF;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">
              Open your dashboard
            </a>
          </p>`,
        footerNote: 'ANC Sports · weekly platform update',
      })

      if (dryRun) {
        previews.push(String(person.person_email))
        continue
      }
      const ok = await sendEmail(
        [String(person.person_email)],
        'This week on the ANC platforms',
        html
      )
      if (ok) sent += 1
    }

    return NextResponse.json({
      ok: true,
      entries: entries.length,
      recipients: recipients.rows.length,
      sent,
      ...(dryRun ? { dryRun: true, wouldSendTo: previews } : {}),
    })
  } catch (err) {
    console.error('Leadership digest cron error:', err)
    return NextResponse.json({ error: 'Failed to send leadership digest' }, { status: 500 })
  }
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
