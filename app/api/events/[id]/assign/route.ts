import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id // Use UUID as string
    const { staffId, role_at_event, estimated_hours } = await request.json()

    // Check if assignment already exists
    const checkResult = await query(
      'SELECT id FROM event_assignments WHERE event_id = $1 AND staff_id = $2',
      [eventId, staffId]
    )

    if (checkResult.rows.length === 0) {
      await query(
        'INSERT INTO event_assignments (event_id, staff_id, role_at_event, estimated_hours) VALUES ($1, $2, $3, $4)',
        [eventId, staffId, role_at_event || 'technician', estimated_hours || 0]
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
