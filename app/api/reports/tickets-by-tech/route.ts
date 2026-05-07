export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Alexis 2026-04-23: "can we also get a report created for tech support
// showing how many tickets each tech closes?"
//
// GET /api/reports/tickets-by-tech?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-technician counts of closed + still-open tickets, plus
// average time-to-close for the closed ones.

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null

  const dateConditions: string[] = []
  const params: unknown[] = []
  if (from) { params.push(from); dateConditions.push(`t.resolved_at::date >= $${params.length}`) }
  if (to)   { params.push(to);   dateConditions.push(`t.resolved_at::date <= $${params.length}`) }
  const closedWhere = dateConditions.length ? `AND ${dateConditions.join(' AND ')}` : ''

  const r = await query(
    `WITH per_tech AS (
       SELECT
         s.id AS tech_id,
         s.full_name AS tech_name,
         s.email AS tech_email,
         COUNT(*) FILTER (WHERE t.status = 'closed' ${closedWhere}) AS closed_count,
         COUNT(*) FILTER (WHERE t.status != 'closed') AS open_count,
         AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)
           FILTER (WHERE t.status = 'closed' AND t.resolved_at IS NOT NULL ${closedWhere})
           AS avg_hours_to_close
       FROM staff s
       LEFT JOIN tickets t ON t.assigned_to = s.id
       WHERE s.is_active = true
       GROUP BY s.id, s.full_name, s.email
     )
     SELECT * FROM per_tech
     WHERE closed_count > 0 OR open_count > 0
     ORDER BY closed_count DESC, tech_name ASC`,
    params
  )

  const totalClosed = r.rows.reduce((s: number, row: any) => s + Number(row.closed_count || 0), 0)
  return NextResponse.json({
    from, to,
    technicians: r.rows.map((row: any) => ({
      tech_id: row.tech_id,
      tech_name: row.tech_name,
      tech_email: row.tech_email,
      closed_count: Number(row.closed_count || 0),
      open_count: Number(row.open_count || 0),
      avg_hours_to_close: row.avg_hours_to_close != null ? Number(Number(row.avg_hours_to_close).toFixed(1)) : null,
      share_pct: totalClosed > 0 ? Number(((row.closed_count / totalClosed) * 100).toFixed(1)) : 0,
    })),
    total_closed_all_techs: totalClosed,
  })
}
