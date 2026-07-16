export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { HoursBudgets, isTwentyBackedEnabled } from '@/lib/twenty-ops'

const DEFAULT_THRESHOLDS = [25, 50, 75, 85, 90, 95, 100]

function normalizeThresholds(value: unknown): number[] {
  if (!Array.isArray(value)) return DEFAULT_THRESHOLDS
  const thresholds = [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 100))].sort((a, b) => a - b)
  return thresholds.length ? thresholds : DEFAULT_THRESHOLDS
}

async function loadAlertSettings(id: string) {
  const result = await query(`SELECT thresholds, recipient_email FROM hours_budget_alert_settings WHERE budget_id = $1`, [id])
  return {
    alert_thresholds: normalizeThresholds(result.rows[0]?.thresholds),
    alert_recipient_email: result.rows[0]?.recipient_email || null,
  }
}

async function saveAlertSettings(id: string, thresholds: unknown, recipientEmail: unknown) {
  const normalized = normalizeThresholds(thresholds)
  const email = typeof recipientEmail === 'string' && recipientEmail.trim() ? recipientEmail.trim() : null
  await query(
    `INSERT INTO hours_budget_alert_settings (budget_id, thresholds, recipient_email, updated_at)
     VALUES ($1, $2::int[], $3, NOW())
     ON CONFLICT (budget_id) DO UPDATE SET thresholds = EXCLUDED.thresholds, recipient_email = EXCLUDED.recipient_email, updated_at = NOW()`,
    [id, normalized, email]
  )
}

async function loadBudget(id: string) {
  const result = await query(
    `SELECT b.id, b.client_name, b.venue_id, v.name as venue_name, b.league, b.season,
            b.total_hours, b.management_times, b.contract_start::text as contract_start, b.contract_end::text as contract_end,
            b.notes, b.tricode, b.created_at, b.updated_at,
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
      const alertSettings = await loadAlertSettings(params.id)
      return NextResponse.json({
        hours_budget: {
          id: b.id,
          client_name: b.budgetClient?.name || '(unknown client)',
          total_hours: 0,
          hours_spent: Number(b.currentHoursUsed || 0),
          created_at: b.createdAt, updated_at: b.updatedAt, ...alertSettings,
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
    // Coerce nullable numerics so the page never has to defend against null
    // — `total_hours = NULL` in the DB used to crash `.toFixed`. Null is
    // intentional now: per Alexis 5/6, no total = unlimited budget.
    budget.total_hours = budget.total_hours == null ? 0 : Number(budget.total_hours)
    budget.hours_spent = Number(budget.hours_spent || 0)
    Object.assign(budget, await loadAlertSettings(params.id))

    // Pull the linked design request title so each time-entry card shows
     // what the time was logged AGAINST (Alexis 5/6 — "can you add what
    // the request is").
    const entries = await query(
      `SELECT te.id, te.budget_id, te.designer_id, s.full_name as designer_name,
              te.design_request_id, te.entry_date::text as entry_date, te.hours, te.description,
              te.created_at,
              dr.job_title as design_request_title,
              dr.tricode as design_request_tricode
       FROM designer_time_entries te
       LEFT JOIN staff s ON s.id = te.designer_id
       LEFT JOIN design_requests dr ON dr.id = te.design_request_id
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
      if ('alert_thresholds' in body || 'alert_recipient_email' in body) {
        const existing = await loadAlertSettings(params.id)
        await saveAlertSettings(
          params.id,
          body.alert_thresholds ?? existing.alert_thresholds,
          body.alert_recipient_email ?? existing.alert_recipient_email
        )
      }
      return NextResponse.json({ hours_budget: { id: updated.id, hours_spent: Number(updated.currentHoursUsed || 0), ...(await loadAlertSettings(params.id)) } })
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
      management_times: 'management_times',
      contract_start: 'contract_start',
      contract_end: 'contract_end',
      notes: 'notes',
      tricode: 'tricode',
    }

    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        let value: any
        if (key === 'total_hours' || key === 'management_times') {
          value = body[key] === '' || body[key] == null ? null : Number(body[key])
        } else if (key === 'tricode') value = body[key]?.trim() ? body[key].trim().toUpperCase() : null
        else value = body[key] || null
        updates.push(`${column} = $${idx++}`)
        values.push(value)
      }
    }

    const hasAlertUpdate = body.alert_thresholds !== undefined || body.alert_recipient_email !== undefined
    if (updates.length === 0 && !hasAlertUpdate) {
      return NextResponse.json({ hours_budget: current })
    }

    if (updates.length) {
      updates.push(`updated_at = NOW()`)
      values.push(params.id)
      await query(
        `UPDATE designer_hours_budgets SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      )
    }
    if (hasAlertUpdate) {
      const existing = await loadAlertSettings(params.id)
      await saveAlertSettings(
        params.id,
        body.alert_thresholds ?? existing.alert_thresholds,
        body.alert_recipient_email ?? existing.alert_recipient_email
      )
    }

    const budget = await loadBudget(params.id)
    Object.assign(budget, await loadAlertSettings(params.id))
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
