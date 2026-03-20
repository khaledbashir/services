import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Get all events for today
    const eventsResult = await query(
      `SELECT 
        e.id,
        e.summary as event_name,
        v.name as venue_name
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.event_date = $1
      ORDER BY e.start_time`,
      [today]
    )

    // For each event, get assigned staff
    const assignedStaff = await Promise.all(
      eventsResult.rows.map(async (event) => {
        const staffResult = await query(
          `SELECT s.full_name
           FROM staff s
           JOIN event_assignments ea ON s.id = ea.staff_id
           WHERE ea.event_id = $1
           ORDER BY s.full_name`,
          [event.id]
        )

        return {
          event_id: event.id,
          event_name: event.event_name,
          venue_name: event.venue_name,
          technicians: staffResult.rows.map((r) => r.full_name),
          has_unassigned_tech: staffResult.rows.length === 0,
        }
      })
    )

    return NextResponse.json({ assignedStaff })
  } catch (err) {
    console.error('Error fetching assigned staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
