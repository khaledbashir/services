export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { HoursBudgets, isTwentyBackedEnabled, type TwentyDesignerHoursBudget } from '@/lib/twenty-ops'
import { loadTriCodeMap, upsertTriCode } from '@/lib/tricode-side-tables'

function reshapeHoursBudget(b: TwentyDesignerHoursBudget, tricode: string | null = null) {
  const raw = b as any
  // Twenty stores the cap as `contractedHours`; earlier reshape hardcoded 0.
  const totalHours = Number(raw.contractedHours ?? raw.totalHoursBudgeted ?? 0)
  const hoursSpent = Number(raw.currentHoursUsed ?? 0)
  return {
    id: b.id,
    client_name: raw.budgetClient?.name || raw.name || '(unknown client)',
    tricode,
    venue_id: null,
    venue_name: null,
    league: null,
    season: (raw.period || '').toString().replace(/^PERIOD_/i, '').toLowerCase() || null,
    total_hours: totalHours,
    contract_start: null,
    contract_end: null,
    notes: null,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    hours_spent: hoursSpent,
    entry_count: 0,
    alert_50_fired: !!raw.alert50Pct,
    alert_75_fired: !!raw.alert75Pct,
    status: (raw.status || '').toString().replace(/^STATUS_/i, '').toLowerCase() || null,
  }
}

const DEFAULT_THRESHOLDS = [25, 50, 75, 85, 90, 95, 100]

function normalizeThresholds(value: unknown): number[] {
  if (!Array.isArray(value)) return DEFAULT_THRESHOLDS
  const thresholds = [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 100))].sort((a, b) => a - b)
  return thresholds.length ? thresholds : DEFAULT_THRESHOLDS
}

async function loadAlertSettings(ids: string[]) {
  if (!ids.length) return new Map<string, { thresholds: number[]; recipient_email: string | null }>()
  const result = await query(
    `SELECT budget_id, thresholds, recipient_email FROM hours_budget_alert_settings WHERE budget_id = ANY($1::text[])`,
    [ids]
  )
  return new Map(result.rows.map((row) => [row.budget_id, {
    thresholds: normalizeThresholds(row.thresholds),
    recipient_email: row.recipient_email || null,
  }]))
}

async function saveAlertSettings(budgetId: string, thresholds: unknown, recipientEmail: unknown) {
  const normalized = normalizeThresholds(thresholds)
  const email = typeof recipientEmail === 'string' && recipientEmail.trim() ? recipientEmail.trim() : null
  await query(
    `INSERT INTO hours_budget_alert_settings (budget_id, thresholds, recipient_email, updated_at)
     VALUES ($1, $2::int[], $3, NOW())
     ON CONFLICT (budget_id) DO UPDATE
       SET thresholds = EXCLUDED.thresholds, recipient_email = EXCLUDED.recipient_email, updated_at = NOW()`,
    [budgetId, normalized, email]
  )
  return { thresholds: normalized, recipient_email: email }
}

async function getBudgetRows() {
  const result = await query(
    `SELECT b.id, b.client_name, b.venue_id, v.name as venue_name, b.league, b.season,
            b.total_hours, b.management_times, b.contract_start::text as contract_start, b.contract_end::text as contract_end,
            b.notes, b.tricode, b.created_at, b.updated_at,
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

  if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
    try {
      const records: TwentyDesignerHoursBudget[] = []
      let cursor: string | null = null
      for (let p = 0; p < 10; p++) {
        const page = await HoursBudgets.list({
          limit: 60,
          startingAfter: cursor || undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const b of page.items) records.push(b)
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      const triCodeMap = await loadTriCodeMap('hours_budget_tricodes', records.map((r) => r.id))
      const alertSettings = await loadAlertSettings(records.map((record) => record.id))
      const items = records.map((b) => ({
        ...reshapeHoursBudget(b, triCodeMap.get(b.id) || null),
        alert_thresholds: alertSettings.get(b.id)?.thresholds || DEFAULT_THRESHOLDS,
        alert_recipient_email: alertSettings.get(b.id)?.recipient_email || null,
      }))
      return NextResponse.json({ hours_budgets: items })
    } catch (err) {
      console.error('[hours-budgets GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list hours budgets from Twenty' }, { status: 500 })
    }
  }

  try {
    const rows = await getBudgetRows()
    const alertSettings = await loadAlertSettings(rows.map((row) => row.id))
    for (const row of rows) {
      row.alert_thresholds = alertSettings.get(row.id)?.thresholds || DEFAULT_THRESHOLDS
      row.alert_recipient_email = alertSettings.get(row.id)?.recipient_email || null
    }
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

    if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
      try {
        const created = await HoursBudgets.create({
          currentHoursUsed: 0,
          alert50Pct: false,
        })
        const savedTriCode = await upsertTriCode('hours_budget_tricodes', created.id, body.tricode)
        const alertSettings = await saveAlertSettings(created.id, body.alert_thresholds, body.alert_recipient_email)
        return NextResponse.json({ hours_budget: { ...reshapeHoursBudget(created, savedTriCode), alert_thresholds: alertSettings.thresholds, alert_recipient_email: alertSettings.recipient_email } })
      } catch (err) {
        console.error('[hours-budgets POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create hours budget in Twenty' }, { status: 500 })
      }
    }

    const result = await query(
      `INSERT INTO designer_hours_budgets
         (client_name, venue_id, league, season, total_hours, management_times, contract_start, contract_end, notes, tricode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        client_name,
        body.venue_id || null,
        body.league || null,
        body.season || null,
        total_hours,
        body.management_times === '' || body.management_times == null
          ? null
          : Number(body.management_times),
        body.contract_start || null,
        body.contract_end || null,
        body.notes || null,
        body.tricode?.trim() ? body.tricode.trim().toUpperCase() : null,
      ]
    )

    const created = await query(
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
      [result.rows[0].id]
    )

    const alertSettings = await saveAlertSettings(result.rows[0].id, body.alert_thresholds, body.alert_recipient_email)
    created.rows[0].alert_thresholds = alertSettings.thresholds
    created.rows[0].alert_recipient_email = alertSettings.recipient_email

    return NextResponse.json({ hours_budget: created.rows[0] })
  } catch (err) {
    console.error('Error creating hours budget:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
