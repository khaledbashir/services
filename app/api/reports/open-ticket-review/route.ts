export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import { getDigestRows, digestContext, isDigestReport } from '@/lib/ticket-digests'
import { DigestReport, daysLabel, STATUS_LABELS, summariseReview } from '@/lib/ticket-digest-format'

/**
 * GET /api/reports/open-ticket-review
 *
 * The data behind Joe's "Open Ticket Review" view — and the exact same rows the
 * 8 AM email is built from, so the screen and the inbox never tell two stories.
 *
 *   ?report=open-review|new-24h|closed-24h|escalated   (default open-review)
 *   ?format=json|csv
 */

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  return `"${String(v).replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const reportParam = (url.searchParams.get('report') || 'open-review').trim()
  if (!isDigestReport(reportParam)) {
    return NextResponse.json({ error: `Unknown report "${reportParam}"` }, { status: 400 })
  }
  const report = reportParam as DigestReport
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  const now = new Date()
  const rows = await getDigestRows(report, now)
  const ctx = digestContext(now)

  if (format === 'csv') {
    const header = ['Ticket', 'Venue', 'Assignee', 'Status', 'Days Since Last Update', 'Last Update Date', 'Latest Update', 'Opened']
    const lines = rows.map((r) => [
      `T-${String(r.ticketNumber).padStart(5, '0')}`,
      r.venue,
      r.assignee,
      STATUS_LABELS[r.status] || r.status,
      r.daysSinceUpdate,
      r.lastUpdateDate,
      r.latestUpdate,
      r.createdDate,
    ])
    const csv = [header, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${report}-${ctx.dateLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv"`,
      },
    })
  }

  return NextResponse.json({
    report,
    dateLabel: ctx.dateLabel,
    summary: summariseReview(rows),
    tickets: rows.map((r) => ({ ...r, daysLabel: daysLabel(r.daysSinceUpdate), statusLabel: STATUS_LABELS[r.status] || r.status })),
  })
}
