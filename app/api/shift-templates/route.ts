import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      `SELECT st.*, v.name as venue_name
       FROM shift_templates st
       JOIN venues v ON st.venue_id = v.id
       ORDER BY st.is_active DESC, v.name, st.name`
    )
    return NextResponse.json({ templates: result.rows })
  } catch (err) {
    console.error('Error fetching shift templates:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { name, venue_id, start_time, end_time, required_staff, recurrence, custom_days } = await request.json()

    if (!name || !venue_id || !start_time || !end_time) {
      return NextResponse.json({ error: 'name, venue_id, start_time, end_time are required' }, { status: 400 })
    }

    const validRecurrences = ['daily', 'weekdays', 'mwf', 'tth', 'weekends', 'custom']
    if (!validRecurrences.includes(recurrence || 'weekdays')) {
      return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO shift_templates (name, venue_id, start_time, end_time, required_staff, recurrence, custom_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, venue_id, start_time, end_time, required_staff || 1, recurrence || 'weekdays', custom_days || [], auth.userId]
    )

    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error creating shift template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
