import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { HoursBudgets, isTwentyBackedEnabled } from '@/lib/twenty-ops'

async function loadBudget(id: string) {
  const result = await query(
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
    [id]
  )

  return result.rows[0] || null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
    try {
      const b = await HoursBudgets.get(params.id)
      if (!b) return NextResponse.json({ error: 'Hours budget not found' }, { status: 404 })
      return NextResponse.json({
        hours_budget: {
          id: b.id,
          client_name: b.budgetClient?.name || '(unknown client)',
          total_hours: 0,
          hours_spent: Number(b.currentHoursUsed || 0),
          created_at: b.createdAt, updated_at: b.updatedAt,
        },
        time_entries: [],
      })
    } catch (err) {
      console.error('[hours-budgets GET [id] twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to fetch hours budget' }, { status: 500 })
    }
  }

  try {
    const budget = await loadBudget(params.id)
    if (!budget) {
      return NextResponse.json({ error: 'Hours budget not found' }, { status: 404 })
    }

    const entries = await query(
      `SELECT te.id, te.budget_id, te.designer_id, s.full_name as designer_name,
              te.design_request_id, te.entry_date::text as entry_date, te.hours, te.description,
              te.created_at
       FROM designer_time_entries te
       LEFT JOIN staff s ON s.id = te.designer_id
       WHERE te.budget_id = $1
       ORDER BY te.entry_date DESC, te.created_at DESC`,
      [params.id]
    )

    return NextResponse.json({ hours_budget: budget, time_entries: entries.rows })
  } catch (err) {
    console.error('Error fetching hours budget:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
    try {
      const body = await request.json()
      const patch: Record<string, unknown> = {}
      if ('hours_spent' in body) patch.currentHoursUsed = Number(body.hours_spent) || 0
      const updated = await HoursBudgets.update(params.id, patch)
      return NextResponse.json({ hours_budget: { id: updated.id, hours_spent: Number(updated.currentHoursUsed || 0) } })
    } catch (err) {
      console.error('[hours-budgets PATCH twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to update hours budget' }, { status: 500 })
    }
  }

  try {
    const body = await request.json()
    const current = await loadBudget(params.id)
    if (!current) {
      return NextResponse.json({ error: 'Hours budget not found' }, { status: 404 })
    }

    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    const columns: Record<string, string> = {
      client_name: 'client_name',
      venue_id: 'venue_id',
      league: 'league',
      season: 'season',
      total_hours: 'total_hours',
      contract_start: 'contract_start',
      contract_end: 'contract_end',
      notes: 'notes',
    }

    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        const value = key === 'total_hours' ? Number(body[key]) : body[key] || null
        updates.push(`${column} = $${idx++}`)
        values.push(value)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ hours_budget: current })
    }

    updates.push(`updated_at = NOW()`)
    values.push(params.id)

    await query(
      `UPDATE designer_hours_budgets SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    )

    const budget = await loadBudget(params.id)
    return NextResponse.json({ hours_budget: budget })
  } catch (err) {
    console.error('Error updating hours budget:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
    try {
      await HoursBudgets.delete(params.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[hours-budgets DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete hours budget' }, { status: 500 })
    }
  }

  try {
    const result = await query('DELETE FROM designer_hours_budgets WHERE id = $1 RETURNING id', [params.id])
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Hours budget not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting hours budget:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
