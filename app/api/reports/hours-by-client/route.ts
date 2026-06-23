export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Alexis 2026-04-23: "We are able to run reports on the amount of hours
// each client does. Are we able to create those?"
//
// GET /api/reports/hours-by-client?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-venue-tricode totals. Alexis 2026-06-23: hour counts should
// follow the tri-code associated with each venue, not the typed client name.

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
       COALESCE(
         NULLIF(TRIM(dr.tricode), ''),
         NULLIF(TRIM(venue_code.tricode), ''),
         '(no tri-code)'
       ) AS client_name,
       COALESCE(
         NULLIF(TRIM(dr.tricode), ''),
         NULLIF(TRIM(venue_code.tricode), '')
       ) AS tricode,
       MIN(NULLIF(TRIM(dr.company_name), '')) AS company_name,
       MIN(v.name) AS venue_name,
       COUNT(DISTINCT dr.id) AS jobs,
       SUM(te.hours)::float8 AS total_hours,
       COUNT(DISTINCT te.designer_id) AS designers_worked,
       MIN(te.entry_date)::text AS first_entry,
       MAX(te.entry_date)::text AS last_entry
     FROM designer_time_entries te
     JOIN design_requests dr ON dr.id = te.design_request_id
     LEFT JOIN venues v ON v.id = dr.venue_id
     LEFT JOIN LATERAL (
       SELECT alias.value AS tricode
       FROM unnest(COALESCE(v.aliases, '{}'::text[])) WITH ORDINALITY alias(value, ord)
       ORDER BY
         CASE
           WHEN regexp_replace(upper(alias.value), '[^A-Z-]', '', 'g') ~ '^[A-Z]{1,3}(-[A-Z]{1,3})?$' THEN 0
           ELSE 1
         END,
         alias.ord
       LIMIT 1
     ) venue_code ON true
     ${where}
     GROUP BY 1, 2
     ORDER BY total_hours DESC`,
    params
  )
  const totalAllClients = r.rows.reduce((s: number, row: any) => s + Number(row.total_hours || 0), 0)
  return NextResponse.json({
    from, to,
    clients: r.rows.map((row: any) => ({
      client_name: row.client_name,
      tricode: row.tricode || null,
      company_name: row.company_name || null,
      venue_name: row.venue_name || null,
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
