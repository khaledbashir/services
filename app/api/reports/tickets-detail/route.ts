export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Chris D 2026-07-10: "I am trying to pull a report for Amerant Bank for all
// tickets. I do not see an option to pull all tickets."
//
// tickets-by-venue answers "how many" per venue. This answers "which ones" —
// the ticket-level line items behind that count, for one venue or all.
//
// GET /api/reports/tickets-detail?venue_id=&from=&to=&status=all&include_merged=0&format=json|csv
//
// Defaults are deliberately wide open: no date bounds and every status. A
// report called "all tickets" that quietly drops closed tickets or anything
// older than 90 days is the bug this route exists to fix.

const KNOWN_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'closed']

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  return `"${String(v).replace(/"/g, '""')}"`
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'all-venues'
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const venueId = url.searchParams.get('venue_id') || null
  const from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null
  const statusParam = (url.searchParams.get('status') || 'all').trim()
  const includeMerged = ['1', 'true', 'yes'].includes((url.searchParams.get('include_merged') || '').toLowerCase())
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  const conditions: string[] = []
  const params: unknown[] = []

  if (venueId) { params.push(venueId); conditions.push(`t.venue_id = $${params.length}`) }
  if (from) { params.push(from); conditions.push(`t.created_at::date >= $${params.length}`) }
  if (to) { params.push(to); conditions.push(`t.created_at::date <= $${params.length}`) }

  // status: 'all' (no filter) | 'active' (anything not closed) | csv list
  if (statusParam === 'active') {
    conditions.push(`t.status <> 'closed'`)
  } else if (statusParam && statusParam !== 'all') {
    const wanted = statusParam.split(',').map(s => s.trim()).filter(s => KNOWN_STATUSES.includes(s))
    if (wanted.length) { params.push(wanted); conditions.push(`t.status = ANY($${params.length})`) }
  }

  // Merged tickets are duplicates folded into a parent. They'd inflate a count,
  // so they're out by default — but the response always reports how many were
  // held back, and include_merged=1 brings them back with the parent labelled.
  if (!includeMerged) conditions.push(`t.merged_into_ticket_id IS NULL`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const r = await query(
    `SELECT
       t.id,
       t.ticket_number,
       t.title,
       t.description,
       COALESCE(v.name, '(unassigned)') AS venue_name,
       t.category,
       t.priority,
       t.status,
       COALESCE(t.source, 'web') AS source,
       s2.full_name AS assigned_to_name,
       s1.full_name AS created_by_name,
       t.contact_name,
       e.summary AS event_name,
       t.created_at,
       t.first_response_at,
       t.resolved_at,
       t.resolution_notes,
       t.sla_response_met,
       t.sla_resolution_met,
       p.ticket_number AS merged_into_ticket_number,
       CASE WHEN t.resolved_at IS NOT NULL
            THEN ROUND((EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1)
       END AS resolution_hours
     FROM tickets t
     LEFT JOIN venues v ON v.id = t.venue_id
     LEFT JOIN staff  s1 ON s1.id = t.created_by
     LEFT JOIN staff  s2 ON s2.id = t.assigned_to
     LEFT JOIN events e  ON e.id = t.event_id
     LEFT JOIN tickets p ON p.id = t.merged_into_ticket_id
     ${where}
     ORDER BY t.created_at DESC`,
    params
  )

  // How many duplicates we held back, so the number is never silently short.
  let mergedExcluded = 0
  if (!includeMerged) {
    const mergedConditions: string[] = [`t.merged_into_ticket_id IS NOT NULL`]
    const mergedParams: unknown[] = []
    if (venueId) { mergedParams.push(venueId); mergedConditions.push(`t.venue_id = $${mergedParams.length}`) }
    if (from) { mergedParams.push(from); mergedConditions.push(`t.created_at::date >= $${mergedParams.length}`) }
    if (to) { mergedParams.push(to); mergedConditions.push(`t.created_at::date <= $${mergedParams.length}`) }
    const m = await query(
      `SELECT COUNT(*)::int AS n FROM tickets t WHERE ${mergedConditions.join(' AND ')}`,
      mergedParams
    )
    mergedExcluded = m.rows[0]?.n || 0
  }

  const rows = r.rows
  const byStatus: Record<string, number> = {}
  for (const s of KNOWN_STATUSES) byStatus[s] = 0
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1

  const resolved = rows.filter((x: any) => x.resolution_hours !== null)
  const avgResolutionHours = resolved.length
    ? Number((resolved.reduce((s: number, x: any) => s + Number(x.resolution_hours), 0) / resolved.length).toFixed(1))
    : null

  const venueName = venueId && rows.length ? rows[0].venue_name : null

  if (format === 'csv') {
    const header = [
      'Ticket #', 'Title', 'Venue', 'Event', 'Category', 'Priority', 'Status', 'Source',
      'Assigned To', 'Opened By', 'Contact', 'Created', 'First Response', 'Resolved',
      'Resolution Hours', 'Response SLA', 'Resolution SLA', 'Merged Into', 'Resolution Notes',
    ]
    const body = rows.map((x: any) => [
      x.ticket_number, x.title, x.venue_name, x.event_name || '', x.category || '', x.priority,
      x.status, x.source, x.assigned_to_name || '', x.created_by_name || '', x.contact_name || '',
      x.created_at ? new Date(x.created_at).toISOString() : '',
      x.first_response_at ? new Date(x.first_response_at).toISOString() : '',
      x.resolved_at ? new Date(x.resolved_at).toISOString() : '',
      x.resolution_hours ?? '',
      x.sla_response_met === null ? '' : x.sla_response_met ? 'Met' : 'Breached',
      x.sla_resolution_met === null ? '' : x.sla_resolution_met ? 'Met' : 'Breached',
      x.merged_into_ticket_number ? `#${x.merged_into_ticket_number}` : '',
      x.resolution_notes || '',
    ])
    const csv = [header, ...body].map(line => line.map(csvEscape).join(',')).join('\n')
    const scope = slugify(venueName || 'all-venues')
    const span = `${from || 'all'}-to-${to || new Date().toISOString().slice(0, 10)}`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tickets-${scope}-${span}.csv"`,
      },
    })
  }

  return NextResponse.json({
    venue_id: venueId,
    venue_name: venueName,
    from, to,
    status: statusParam,
    include_merged: includeMerged,
    merged_excluded: mergedExcluded,
    total: rows.length,
    by_status: byStatus,
    avg_resolution_hours: avgResolutionHours,
    first_ticket: rows.length ? rows[rows.length - 1].created_at : null,
    last_ticket: rows.length ? rows[0].created_at : null,
    tickets: rows,
  })
}
