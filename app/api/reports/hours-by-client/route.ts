import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Alexis 2026-04-23: "We are able to run reports on the amount of hours
// each client does. Are we able to create those?"
//
// GET /api/reports/hours-by-client?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-client totals + optional per-designer breakdown.

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null

  const conditions: string[] = []
  const params: unknown[] = []
  if (from) { params.push(from); conditions.push(`te.entry_date >= $${params.length}`) }
  if (to)   { params.push(to);   conditions.push(`te.entry_date <= $${params.length}`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const r = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(dr.company_name), ''), '(no client)') AS client_name,
       COUNT(DISTINCT dr.id) AS jobs,
       SUM(te.hours)::float8 AS total_hours,
       COUNT(DISTINCT te.designer_id) AS designers_worked,
       MIN(te.entry_date)::text AS first_entry,
       MAX(te.entry_date)::text AS last_entry
     FROM designer_time_entries te
     JOIN design_requests dr ON dr.id = te.design_request_id
     ${where}
     GROUP BY 1
     ORDER BY total_hours DESC`,
    params
  )
  const totalAllClients = r.rows.reduce((s: number, row: any) => s + Number(row.total_hours || 0), 0)
  return NextResponse.json({
    from, to,
    clients: r.rows.map((row: any) => ({
      client_name: row.client_name,
      jobs: Number(row.jobs || 0),
      total_hours: Number(Number(row.total_hours || 0).toFixed(2)),
      designers_worked: Number(row.designers_worked || 0),
      first_entry: row.first_entry,
      last_entry: row.last_entry,
      share_pct: totalAllClients > 0 ? Number(((row.total_hours / totalAllClients) * 100).toFixed(1)) : 0,
    })),
    total_hours_all_clients: Number(totalAllClients.toFixed(2)),
  })
}
