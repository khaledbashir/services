export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Alexis 2026-04-23: clicking a client on the hours-by-client report should
// drill into that client's individual design requests with the same
// date-window + share-bar shape. Alexis 2026-06-23 clarified the bucket must
// be the venue tri-code rather than the typed client/company name.
//
// GET /api/reports/hours-by-client/[client]?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns one row per design_request for this client, with hours logged
// inside the window.

export async function GET(request: NextRequest, { params }: { params: { client: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null
  const clientName = decodeURIComponent(params.client)

  const conditions: string[] = []
  const queryParams: unknown[] = []

  queryParams.push(clientName)
  const clientIdx = queryParams.length
  const tricodeExpr = `COALESCE(NULLIF(TRIM(dr.tricode), ''), NULLIF(TRIM(venue_code.tricode), ''))`
  const clientMatch = clientName === '(no tri-code)'
    ? `${tricodeExpr} IS NULL`
    : `UPPER(${tricodeExpr}) = UPPER(TRIM($${clientIdx}))`
  conditions.push(clientMatch)

  if (from) { queryParams.push(from); conditions.push(`te.entry_date >= $${queryParams.length}`) }
  if (to)   { queryParams.push(to);   conditions.push(`te.entry_date <= $${queryParams.length}`) }
  const where = `WHERE ${conditions.join(' AND ')}`

  const r = await query(
    `SELECT
       dr.id,
       dr.job_title,
       dr.company_name,
       ${tricodeExpr} AS tricode,
       v.name AS venue_name,
       dr.status,
       dr.due_date::text AS due_date,
       dr.created_at::text AS created_at,
       SUM(te.hours)::float8 AS total_hours,
       COUNT(DISTINCT te.designer_id) AS designers_worked,
       COUNT(te.id) AS entries,
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
     GROUP BY dr.id, dr.job_title, dr.company_name, dr.tricode, venue_code.tricode, v.name, dr.status, dr.due_date, dr.created_at
     ORDER BY total_hours DESC`,
    queryParams
  )

  const totalHours = r.rows.reduce((s: number, row: any) => s + Number(row.total_hours || 0), 0)

  return NextResponse.json({
    client_name: clientName,
    from, to,
    requests: r.rows.map((row: any) => ({
      id: row.id,
      job_title: row.job_title || '(untitled)',
      company_name: row.company_name || null,
      tricode: row.tricode || null,
      venue_name: row.venue_name || null,
      status: row.status,
      due_date: row.due_date,
      created_at: row.created_at,
      total_hours: Number(Number(row.total_hours || 0).toFixed(2)),
      designers_worked: Number(row.designers_worked || 0),
      entries: Number(row.entries || 0),
      first_entry: row.first_entry,
      last_entry: row.last_entry,
      share_pct: totalHours > 0 ? Number(((row.total_hours / totalHours) * 100).toFixed(1)) : 0,
    })),
    total_hours: Number(totalHours.toFixed(2)),
  })
}
