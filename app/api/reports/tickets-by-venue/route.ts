import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Chris D 2026-04-23: "is there a section that shows how many tickets have
// been linked to a specific venue?"
//
// GET /api/reports/tickets-by-venue?from=&to=
// Counts tickets per venue with open / closed / total + time range.

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null

  // Date filter applies to created_at (when the ticket landed, the natural
  // interval for "how many tickets came in at this venue").
  const conditions: string[] = []
  const params: unknown[] = []
  if (from) { params.push(from); conditions.push(`t.created_at::date >= $${params.length}`) }
  if (to)   { params.push(to);   conditions.push(`t.created_at::date <= $${params.length}`) }
  const dateFilter = conditions.length ? conditions.join(' AND ') : null

  const r = await query(
    `SELECT
       COALESCE(v.id::text, '(no venue)') AS venue_id,
       COALESCE(v.name, '(unassigned)') AS venue_name,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE t.status = 'closed') AS closed,
       COUNT(*) FILTER (WHERE t.status != 'closed') AS open,
       COUNT(*) FILTER (WHERE t.priority IN ('high','critical') AND t.status != 'closed') AS urgent_open,
       MIN(t.created_at)::text AS first_ticket,
       MAX(t.created_at)::text AS last_ticket
     FROM tickets t
     LEFT JOIN venues v ON v.id = t.venue_id
     ${dateFilter ? `WHERE ${dateFilter}` : ''}
     GROUP BY v.id, v.name
     ORDER BY total DESC, venue_name ASC`,
    params
  )
  const grandTotal = r.rows.reduce((s: number, row: any) => s + Number(row.total || 0), 0)
  return NextResponse.json({
    from, to,
    venues: r.rows.map((row: any) => ({
      venue_id: row.venue_id === '(no venue)' ? null : row.venue_id,
      venue_name: row.venue_name,
      total: Number(row.total || 0),
      closed: Number(row.closed || 0),
      open: Number(row.open || 0),
      urgent_open: Number(row.urgent_open || 0),
      first_ticket: row.first_ticket,
      last_ticket: row.last_ticket,
      share_pct: grandTotal > 0 ? Number(((row.total / grandTotal) * 100).toFixed(1)) : 0,
    })),
    total_tickets: grandTotal,
  })
}
