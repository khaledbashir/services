export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { TimeEntries, isTwentyBackedEnabled, type TwentyDesignerTimeEntry } from '@/lib/twenty-ops'

function stripPrefix(raw: string | null | undefined, prefix: string): string | null {
  if (!raw) return null
  return raw.toString().replace(new RegExp(`^${prefix}`, 'i'), '').toLowerCase() || null
}

function reshapeTimeEntry(t: TwentyDesignerTimeEntry) {
  const raw = t as any
  return {
    id: t.id,
    budget_id: null,
    designer_id: raw.entryDesignerId || null,
    designer_name: raw.entryDesigner ? `${raw.entryDesigner.name.firstName} ${raw.entryDesigner.name.lastName}`.trim() : null,
    design_request_id: null,
    entry_date: raw.date || (raw.createdAt ? raw.createdAt.slice(0, 10) : null),
    hours: Number(raw.hoursSpent ?? 0),
    description: raw.taskName || raw.comment || raw.name || '',
    category: stripPrefix(raw.category, 'CATEGORY_'),
    billing_type: stripPrefix(raw.billingType, 'BILLING_'),
    client_id: raw.entryClientId || null,
    client_name: raw.entryClient?.name || null,
    wrike_timelog_id: raw.wrikeTimelogId || null,
    wrike_task_id: raw.wrikeTaskId || null,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    // Time entries have no venue relation in Twenty — leave blank rather than misrepresent.
    budget_client_name: raw.entryClient?.name || null,
    budget_venue_id: null,
    venue_name: null,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('TIME_ENTRIES')) {
    try {
      const { searchParams } = new URL(request.url)
      const designerId = searchParams.get('designer_id')
      const from = searchParams.get('from')
      const to = searchParams.get('to')
      const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 2000)

      // Translate dashboard filter params to Twenty REST filter syntax.
      // 28k records total — filters are mandatory UX, not optional.
      const filters: string[] = []
      if (designerId) filters.push(`entryDesignerId[eq]:"${designerId}"`)
      if (from) filters.push(`createdAt[gte]:"${from}T00:00:00Z"`)
      if (to)   filters.push(`createdAt[lte]:"${to}T23:59:59Z"`)

      const items: any[] = []
      let cursor: string | null = null
      while (items.length < limit) {
        const pageSize = Math.min(60, limit - items.length)
        const page = await TimeEntries.list({
          limit: pageSize,
          startingAfter: cursor || undefined,
          filter: filters.length ? filters.join(',') : undefined,
          orderBy: 'createdAt[DescNullsLast]',
        })
        for (const t of page.items) items.push(reshapeTimeEntry(t))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ time_entries: items, next_cursor: cursor, filters_applied: filters.length })
    } catch (err) {
      console.error('[time-entries GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list time entries from Twenty' }, { status: 500 })
    }
  }

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

    if (isTwentyBackedEnabled('TIME_ENTRIES')) {
      try {
        const created = await TimeEntries.create({
          comment: body.description || null,
          taskName: body.description || 'Time entry',
        })
        return NextResponse.json({ time_entry: reshapeTimeEntry(created) })
      } catch (err) {
        console.error('[time-entries POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create time entry in Twenty' }, { status: 500 })
      }
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
