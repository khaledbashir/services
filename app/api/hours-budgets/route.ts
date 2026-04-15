import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

async function getBudgetRows() {
  const result = await query(
    `SELECT b.id, b.client_name, b.venue_id, v.name as venue_name, b.league, b.season,
            b.total_hours, b.contract_start::text as contract_start, b.contract_end::text as contract_end,
            b.notes, b.created_at, b.updated_at,
            COALESCE(SUM(te.hours), 0)::float8 as hours_spent,
            COUNT(te.id)::int as entry_count
     FROM designer_hours_budgets b
     LEFT JOIN venues v ON v.id = b.venue_id
     LEFT JOIN designer_time_entries te ON te.budget_id = b.id
     GROUP BY b.id, v.name
     ORDER BY COALESCE(b.contract_end, b.created_at) DESC, b.created_at DESC`
  )

  return result.rows
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const rows = await getBudgetRows()
    return NextResponse.json({ hours_budgets: rows })
  } catch (err) {
    console.error('Error fetching hours budgets:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const client_name = String(body.client_name || '').trim()
    const total_hours = body.total_hours !== undefined && body.total_hours !== null ? Number(body.total_hours) : NaN

    if (!client_name) {
      return NextResponse.json({ error: 'client_name is required' }, { status: 400 })
    }
    if (!Number.isFinite(total_hours)) {
      return NextResponse.json({ error: 'total_hours is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO designer_hours_budgets
         (client_name, venue_id, league, season, total_hours, contract_start, contract_end, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        client_name,
        body.venue_id || null,
        body.league || null,
        body.season || null,
        total_hours,
        body.contract_start || null,
        body.contract_end || null,
        body.notes || null,
      ]
    )

    const created = await query(
      `SELECT b.id, b.client_name, b.venue_id, v.name as venue_name, b.league, b.season,
              b.total_hours, b.contract_start::text as contract_start, b.contract_end::text as contract_end,
              b.notes, b.created_at, b.updated_at,
              COALESCE(SUM(te.hours), 0)::float8 as hours_spent,
              COUNT(te.id)::int as entry_count
       FROM designer_hours_budgets b
       LEFT JOIN venues v ON v.id = b.venue_id
       LEFT JOIN designer_time_entries te ON te.budget_id = b.id
       WHERE b.id = $1
       GROUP BY b.id, v.name`,
      [result.rows[0].id]
    )

    return NextResponse.json({ hours_budget: created.rows[0] })
  } catch (err) {
    console.error('Error creating hours budget:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
