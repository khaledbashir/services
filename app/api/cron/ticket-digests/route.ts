export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { sendSlackMessage } from '@/lib/slack'
import {
  DIGEST_REPORTS,
  digestContext,
  getDigestRows,
  getLastSentDate,
  getRecipients,
  isDigestReport,
  markSent,
  newYorkDateKey,
  newYorkHour,
  REPORT_SUBJECTS,
} from '@/lib/ticket-digests'
import {
  DigestReport,
  renderActivityEmail,
  renderOpenReviewEmail,
  renderOpenReviewSlack,
} from '@/lib/ticket-digest-format'

/**
 * GET /api/cron/ticket-digests
 *
 * Joe Occhipinti 2026-08-13: "Can I get an email or slack each morning at 8am
 * New York time with a recap of all tickets that are still open."  Charlie Dinh
 * in the same thread: the Salesforce report emails — new tickets, closed in the
 * last 24 hours, escalated.
 *
 * Scheduling: the host cron hits this EVERY hour and the route itself decides
 * whether it is 8:00 AM in New York. That keeps the send at Joe's local 8 AM
 * through both DST switches — a fixed UTC crontab line drifts to 7 AM or 9 AM
 * twice a year, which is exactly the kind of quiet failure nobody reports.
 *
 *   0 * * * * curl -sk -H "Authorization: Bearer $CRON_SECRET" \
 *     https://services.ancsports.net/api/cron/ticket-digests
 *
 * Query params (all optional):
 *   report=open-review|new-24h|closed-24h|escalated   one report instead of all
 *   force=1        ignore the 8 AM window and the already-sent-today stamp
 *   dryRun=1       build everything, send nothing, report what it would do
 *   recipients=a@b.com,c@d.com    override the configured list (testing)
 *   preview=1      return the rendered HTML of a single report instead of JSON
 */

// The daily recap goes out every morning even when the board is quiet — Joe
// reads it as a standing checkpoint. The activity reports only fire when they
// have something in them, so a quiet week does not train people to ignore them.
const ALWAYS_SEND: DigestReport[] = ['open-review']

function resolveSlackChannel(): string {
  return (
    process.env.OPEN_TICKET_REVIEW_SLACK_CHANNEL ||
    process.env.SLACK_SUPPORT_CHANNEL ||
    process.env.SLACK_DEFAULT_CHANNEL ||
    ''
  ).trim()
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = ['1', 'true', 'yes'].includes((url.searchParams.get('force') || '').toLowerCase())
  const dryRun = ['1', 'true', 'yes'].includes((url.searchParams.get('dryRun') || '').toLowerCase())
  const preview = ['1', 'true', 'yes'].includes((url.searchParams.get('preview') || '').toLowerCase())
  const reportParam = (url.searchParams.get('report') || '').trim()
  const recipientOverride = (url.searchParams.get('recipients') || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))

  if (reportParam && !isDigestReport(reportParam)) {
    return NextResponse.json({ error: `Unknown report "${reportParam}"`, known: DIGEST_REPORTS }, { status: 400 })
  }

  const now = new Date()
  const hourET = newYorkHour(now)
  const dateKeyET = newYorkDateKey(now)
  const ctx = digestContext(now)
  const reports: DigestReport[] = reportParam ? [reportParam as DigestReport] : DIGEST_REPORTS

  // Preview renders one report's HTML on demand — used to eyeball the actual
  // email body without waiting for 8 AM or putting a message in anyone's inbox.
  if (preview) {
    const report = (reportParam || 'open-review') as DigestReport
    const rows = await getDigestRows(report, now)
    const html =
      report === 'open-review'
        ? renderOpenReviewEmail(rows, ctx)
        : renderActivityEmail(report, rows, ctx)
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  if (!force && hourET !== 8) {
    return NextResponse.json({ ok: true, skipped: 'outside 8 AM New York window', hourET, dateKeyET })
  }

  const results: Array<Record<string, unknown>> = []

  for (const report of reports) {
    try {
      if (!force) {
        const lastSent = await getLastSentDate(report)
        if (lastSent === dateKeyET) {
          results.push({ report, skipped: 'already sent today', lastSent })
          continue
        }
      }

      const rows = await getDigestRows(report, now)
      if (rows.length === 0 && !ALWAYS_SEND.includes(report)) {
        // Nothing to report is not a failure — stamp it so a later run in the
        // same hour does not re-check, and move on.
        if (!dryRun) await markSent(report, dateKeyET)
        results.push({ report, sent: false, count: 0, skipped: 'nothing to report' })
        continue
      }

      const recipients = recipientOverride.length > 0 ? recipientOverride : await getRecipients(report)
      const subject = REPORT_SUBJECTS[report](rows.length, ctx.dateLabel)
      const html =
        report === 'open-review' ? renderOpenReviewEmail(rows, ctx) : renderActivityEmail(report, rows, ctx)

      let emailed = false
      let slacked = false

      if (dryRun) {
        results.push({ report, dryRun: true, count: rows.length, recipients, subject, htmlBytes: html.length })
        continue
      }

      if (recipients.length > 0) {
        emailed = await sendEmail(recipients, subject, html)
      }

      // Joe asked for "an email or slack" — he gets both, so the recap is
      // waiting wherever he starts his morning.
      if (report === 'open-review') {
        const channel = resolveSlackChannel()
        if (channel) {
          const msg = renderOpenReviewSlack(rows, ctx)
          slacked = await sendSlackMessage({ channel, text: msg.text, blocks: msg.blocks as any[] })
        }
      }

      // Only retire the day once something actually went out. Stamping a failed
      // send would silence the report until tomorrow with nobody the wiser.
      if (emailed || slacked) await markSent(report, dateKeyET)

      results.push({ report, count: rows.length, recipients: recipients.length, emailed, slacked, subject })
    } catch (err) {
      console.error(`[ticket-digests] ${report} failed:`, err)
      results.push({ report, error: err instanceof Error ? err.message : String(err) })
    }
  }

  console.info('[ticket-digests]', JSON.stringify({ hourET, dateKeyET, force, dryRun, results }))
  return NextResponse.json({ ok: true, hourET, dateKeyET, force, dryRun, results })
}
