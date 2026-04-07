import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser, isAuthError, requireRole } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Event details with venue
    const eventResult = await query(
      `SELECT
        e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date, e.start_time, e.end_time, e.league,
        e.workflow_status, e.venue_id, e.requires_staffing, e.source,
        v.name as venue_name,
        COALESCE(v.requires_assignment, true) as venue_requires_assignment
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE e.id = $1`,
      [id]
    )

    if (!eventResult.rows.length) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const event = eventResult.rows[0]

    if (user.role === 'technician') {
      const accessResult = await query(
        `SELECT 1
         FROM event_assignments
         WHERE event_id = $1 AND staff_id = $2
         LIMIT 1`,
        [id, user.userId]
      )
      if (accessResult.rows.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { id } = params
    const body = await request.json()

    if ('requires_staffing' in body) {
      const val = body.requires_staffing === null ? null : Boolean(body.requires_staffing)
      await query(
        `UPDATE events SET requires_staffing = $1 WHERE id = $2`,
        [val, id]
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error updating event:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
