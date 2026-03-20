import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Event details with venue
    const eventResult = await query(
      `SELECT 
        e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date, e.start_time, e.end_time, e.league, 
        e.workflow_status, e.venue_id,
        v.name as venue_name
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE e.id = $1`,
      [id]
    )

    if (!eventResult.rows.length) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const event = eventResult.rows[0]

    // Assigned technicians
    const techResult = await query(
      `SELECT s.id, s.full_name
       FROM event_assignments ea
       JOIN staff s ON ea.staff_id = s.id
       WHERE ea.event_id = $1`,
      [id]
    )

    // Workflow submissions with staff and details
    const workflowResult = await query(
      `SELECT 
        ws.id, ws.type, ws.submitted_at, s.full_name as staff_name,
        ws.data as submission_data
      FROM workflow_submissions ws
      JOIN staff s ON ws.staff_id = s.id
      WHERE ws.event_id = $1
      ORDER BY ws.submitted_at ASC`,
      [id]
    )

    // Recent events at same venue
    const recentResult = await query(
      `SELECT e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date, e.workflow_status
       FROM events e
       WHERE e.venue_id = $1 AND e.id != $2
       ORDER BY e.event_date DESC
       LIMIT 3`,
      [event.venue_id, id]
    )

    // Open tickets at this venue
    const ticketsResult = await query(
      `SELECT t.id, t.title, t.status, t.priority
       FROM tickets t
       WHERE t.venue_id = $1 AND t.status != 'closed'
       ORDER BY t.created_at DESC
       LIMIT 5`,
      [event.venue_id]
    )

    return NextResponse.json({
      event,
      technicians: techResult.rows,
      workflows: workflowResult.rows,
      recentEvents: recentResult.rows,
      openTickets: ticketsResult.rows,
    })
  } catch (err) {
    console.error('Error fetching event:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
