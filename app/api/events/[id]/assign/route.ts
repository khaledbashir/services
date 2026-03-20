import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const eventId = params.id // Use UUID as string
    const { staffId, role_at_event, estimated_hours } = await request.json()

    // Check if assignment already exists
    const checkResult = await query(
      'SELECT id FROM event_assignments WHERE event_id = $1 AND staff_id = $2',
      [eventId, staffId]
    )

    if (checkResult.rows.length === 0) {
      // Auto-populate estimated_hours from league defaults if not provided
      let hours = estimated_hours
      if (!hours) {
        const leagueResult = await query(
          `SELECT ls.estimated_hours FROM events e
           JOIN league_settings ls ON e.league = ls.league
           WHERE e.id = $1`,
          [eventId]
        )
        hours = leagueResult.rows[0]?.estimated_hours || 0
      }

      await query(
        'INSERT INTO event_assignments (event_id, staff_id, role_at_event, estimated_hours) VALUES ($1, $2, $3, $4)',
        [eventId, staffId, role_at_event || 'technician', hours]
      )
    }

    // Return updated assignments
    const result = await query(
      'SELECT s.id, s.full_name as name, ea.role_at_event FROM staff s JOIN event_assignments ea ON s.id = ea.staff_id WHERE ea.event_id = $1',
      [eventId]
    )

    return NextResponse.json({ assignedTechs: result.rows })
  } catch (err) {
    console.error('Error assigning tech:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const eventId = params.id // Use UUID as string
    const { staffId } = await request.json()

    await query(
      'DELETE FROM event_assignments WHERE event_id = $1 AND staff_id = $2',
      [eventId, staffId]
    )

    const result = await query(
      'SELECT s.id, s.full_name as name, ea.role_at_event FROM staff s JOIN event_assignments ea ON s.id = ea.staff_id WHERE ea.event_id = $1',
      [eventId]
    )

    return NextResponse.json({ assignedTechs: result.rows })
  } catch (err) {
    console.error('Error removing tech:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
