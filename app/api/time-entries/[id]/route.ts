import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

async function loadEntry(id: string) {
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
     WHERE te.id = $1`,
    [id]
  )
  return result.rows[0] || null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const timeEntry = await loadEntry(params.id)
    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }
    return NextResponse.json({ time_entry: timeEntry })
  } catch (err) {
    console.error('Error fetching time entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const current = await loadEntry(params.id)
    if (!current) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    const columns: Record<string, string> = {
      budget_id: 'budget_id',
      designer_id: 'designer_id',
      design_request_id: 'design_request_id',
      entry_date: 'entry_date',
      hours: 'hours',
      description: 'description',
    }

    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        const value = key === 'hours' ? Number(body[key]) : body[key] || null
        updates.push(`${column} = $${idx++}`)
        values.push(value)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ time_entry: current })
    }

    values.push(params.id)
    await query(`UPDATE designer_time_entries SET ${updates.join(', ')} WHERE id = $${idx}`, values)

    const timeEntry = await loadEntry(params.id)
    return NextResponse.json({ time_entry: timeEntry })
  } catch (err) {
    console.error('Error updating time entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const result = await query('DELETE FROM designer_time_entries WHERE id = $1 RETURNING id', [params.id])
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting time entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
