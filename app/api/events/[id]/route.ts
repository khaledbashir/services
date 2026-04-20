import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser, isAuthError, requireRole } from '@/lib/rbac'
import { combineLocalToUtc } from '@/lib/timezone'
import { syncEventsToTwenty } from '@/lib/twenty-sync'

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
        COALESCE(v.timezone, 'America/New_York') as venue_timezone,
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

    // Is Event Support contracted for this venue? Drives the assignment-prompt banner.
    const eventSupportResult = await query(
      `SELECT COALESCE(vs.enabled, false) as enabled
       FROM service_types st
       LEFT JOIN venue_services vs
         ON vs.service_type_id = st.id AND vs.venue_id = $1
       WHERE st.name = 'Event Support'
       LIMIT 1`,
      [event.venue_id]
    )
    const eventSupportContracted = eventSupportResult.rows[0]?.enabled === true

    return NextResponse.json({
      event,
      technicians: techResult.rows,
      workflows: workflowResult.rows,
      recentEvents: recentResult.rows,
      openTickets: ticketsResult.rows,
      eventSupportContracted,
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

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if ('requires_staffing' in body) {
      const val = body.requires_staffing === null ? null : Boolean(body.requires_staffing)
      updates.push(`requires_staffing = $${paramIndex++}`)
      values.push(val)
    }

    if ('summary' in body && typeof body.summary === 'string' && body.summary.trim()) {
      updates.push(`summary = $${paramIndex++}`)
      values.push(body.summary.trim())
    }

    if ('event_date' in body && /^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) {
      updates.push(`event_date = $${paramIndex++}`)
      values.push(body.event_date)
    }

    // start_time/end_time updates come in as "HH:MM" wall-clock in the
    // venue's timezone; convert to real UTC before writing.
    const needsTimeUpdate = ('start_time' in body || 'end_time' in body)
    let venueTimezone = 'America/New_York'
    let eventDateForTime: string | null = null
    if (needsTimeUpdate) {
      const ctxRes = await query(
        `SELECT TO_CHAR(e.event_date, 'YYYY-MM-DD') as d, COALESCE(v.timezone, 'America/New_York') as tz
         FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = $1`,
        [id]
      )
      venueTimezone = ctxRes.rows[0]?.tz || 'America/New_York'
      eventDateForTime = body.event_date || ctxRes.rows[0]?.d || null
    }

    if ('start_time' in body && typeof body.start_time === 'string') {
      const timeMatch = body.start_time.match(/^(\d{2}:\d{2})$/)
      if (timeMatch && eventDateForTime) {
        const utc = combineLocalToUtc(eventDateForTime, timeMatch[1], venueTimezone)
        if (utc) {
          updates.push(`start_time = $${paramIndex++}`)
          values.push(utc)
        }
      }
    }

    if ('end_time' in body && typeof body.end_time === 'string') {
      const timeMatch = body.end_time.match(/^(\d{2}:\d{2})$/)
      if (timeMatch && eventDateForTime) {
        const utc = combineLocalToUtc(eventDateForTime, timeMatch[1], venueTimezone)
        if (utc) {
          updates.push(`end_time = $${paramIndex++}`)
          values.push(utc)
        }
      }
    }

    if ('league' in body) {
      updates.push(`league = $${paramIndex++}`)
      values.push(body.league || null)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(id)
    await query(
      `UPDATE events SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    )

    // --- CRM SYNC: push updated event to Twenty ---
    ;(async () => {
      try {
        const freshEvent = await query(
          `SELECT e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
                  e.league, e.workflow_status, e.start_time,
                  v.name as venue_name, e.venue_id,
                  COALESCE(string_agg(s.full_name, ', '), '') as assigned_techs
           FROM events e
           LEFT JOIN venues v ON e.venue_id = v.id
           LEFT JOIN event_assignments ea ON ea.event_id = e.id
           LEFT JOIN staff s ON ea.staff_id = s.id
           WHERE e.id = $1
           GROUP BY e.id, v.name`,
          [id]
        )
        if (freshEvent.rows[0]) {
          const fe = freshEvent.rows[0]
          await syncEventsToTwenty([{
            id: fe.id,
            name: fe.summary,
            event_date: fe.event_date,
            venue_name: fe.venue_name || '',
            venue_id: fe.venue_id,
            league: fe.league || '',
            workflow_status: fe.workflow_status,
            assigned_techs: fe.assigned_techs || '',
            summary: fe.summary,
            start_time: fe.start_time || '',
          }])
        }
      } catch (crmErr) {
        console.error('[twenty] event update sync error:', crmErr)
      }
    })()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error updating event:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
