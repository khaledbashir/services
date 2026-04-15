import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const { searchParams } = new URL(request.url)
    const designerId = searchParams.get('designer_id')
    const budgetId = searchParams.get('budget_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const conditions: string[] = []
    const values: any[] = []
    let idx = 1

    if (designerId) {
      conditions.push(`te.designer_id = $${idx++}`)
      values.push(designerId)
    }
    if (budgetId) {
      conditions.push(`te.budget_id = $${idx++}`)
      values.push(budgetId)
    }
    if (from) {
      conditions.push(`te.entry_date >= $${idx++}`)
      values.push(from)
    }
    if (to) {
      conditions.push(`te.entry_date <= $${idx++}`)
      values.push(to)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `SELECT te.id, te.budget_id, te.designer_id, s.full_name as designer_name,
              te.design_request_id, te.entry_date::text as entry_date, te.hours, te.description,
              te.created_at,
              b.client_name as budget_client_name, b.venue_id as budget_venue_id,
              v.name as venue_name
       FROM designer_time_entries te
       LEFT JOIN staff s ON s.id = te.designer_id
       LEFT JOIN designer_hours_budgets b ON b.id = te.budget_id
       LEFT JOIN venues v ON v.id = b.venue_id
       ${whereClause}
       ORDER BY te.entry_date DESC, te.created_at DESC`,
      values
    )

    return NextResponse.json({ time_entries: result.rows })
  } catch (err) {
    console.error('Error fetching time entries:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const hours = body.hours !== undefined && body.hours !== null ? Number(body.hours) : NaN

    if (!Number.isFinite(hours)) {
      return NextResponse.json({ error: 'hours is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO designer_time_entries
         (budget_id, designer_id, design_request_id, entry_date, hours, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        body.budget_id || null,
        body.designer_id || null,
        body.design_request_id || null,
        body.entry_date || new Date().toISOString().slice(0, 10),
        hours,
        body.description || null,
      ]
    )

    const created = await query(
      `SELECT te.id, te.budget_id, te.designer_id, s.full_name as designer_name,
              te.design_request_id, te.entry_date::text as entry_date, te.hours, te.description,
              te.created_at,
              b.client_name as budget_client_name, b.venue_id as budget_venue_id,
              v.name as venue_name
       FROM designer_time_entries te
       LEFT JOIN staff s ON s.id = te.designer_id
       LEFT JOIN designer_hours_budgets b ON b.id = te.budget_id
       LEFT JOIN venues v ON v.id = b.venue_id
       WHERE te.id = $1`,
      [result.rows[0].id]
    )

    return NextResponse.json({ time_entry: created.rows[0] })
  } catch (err) {
    console.error('Error creating time entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
