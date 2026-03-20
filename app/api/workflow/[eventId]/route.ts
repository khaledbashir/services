import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { appendFile } from 'fs/promises'
import { resolve } from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const eventId = params.eventId

    // Get event details
    const eventResult = await query(
      `SELECT 
        e.id,
        e.summary,
        v.name as venue_name,
        e.league,
        e.start_time,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE e.id = $1`,
      [eventId]
    )

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Get assigned technicians
    const techsResult = await query(
      `SELECT DISTINCT s.id, s.full_name
       FROM staff s
       JOIN event_assignments ea ON s.id = ea.staff_id
       WHERE ea.event_id = $1`,
      [eventId]
    )

    // Get all active staff as fallback
    const allStaffResult = await query(
      `SELECT id, full_name FROM staff WHERE is_active = true ORDER BY full_name`
    )

    // Get workflow submissions and map DB types to frontend types
    const workflowResult = await query(
      `SELECT type, submitted_at, staff_id
       FROM workflow_submissions
       WHERE event_id = $1
       ORDER BY submitted_at DESC`,
      [eventId]
    )

    // Transform to expected format with frontend type names
    const workflow = {
      checked_in: null as string | null,
      game_ready: null as string | null,
      post_game_submitted: null as string | null,
    }

    for (const row of workflowResult.rows) {
      // Map DB types back to frontend types
      if (row.type === 'check_in') workflow.checked_in = row.submitted_at
      else if (row.type === 'game_ready') workflow.game_ready = row.submitted_at
      else if (row.type === 'post_game_report') workflow.post_game_submitted = row.submitted_at
    }

    return NextResponse.json({
      event: eventResult.rows[0],
      assignedTechs: techsResult.rows,
      allStaff: allStaffResult.rows,
      workflow,
    })
  } catch (err) {
    console.error('Error fetching workflow:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const eventId = params.eventId
    const { staffId, type, data } = await request.json()

    // Map frontend type names to database type names
    const typeMap: Record<string, string> = {
      'checked_in': 'check_in',
      'game_ready': 'game_ready',
      'post_game_submitted': 'post_game_report',
    }

    const submissionType = typeMap[type]
    if (!submissionType) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    // Insert workflow submission with ON CONFLICT DO UPDATE to handle resubmissions
    await query(
      `INSERT INTO workflow_submissions (event_id, staff_id, type, data, submitted_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (event_id, staff_id, type) DO UPDATE 
       SET data = EXCLUDED.data, submitted_at = NOW()`,
      [eventId, staffId, submissionType, data ? JSON.stringify(data) : '{}']
    )

    // Get all workflow submissions for event
    const workflowResult = await query(
      `SELECT type, submitted_at
       FROM workflow_submissions
       WHERE event_id = $1
       ORDER BY submitted_at DESC`,
      [eventId]
    )

    // Transform to expected format with frontend type names
    const workflow = {
      checked_in: null as string | null,
      game_ready: null as string | null,
      post_game_submitted: null as string | null,
    }

    for (const row of workflowResult.rows) {
      // Map DB types back to frontend types
      if (row.type === 'check_in') workflow.checked_in = row.submitted_at
      else if (row.type === 'game_ready') workflow.game_ready = row.submitted_at
      else if (row.type === 'post_game_report') workflow.post_game_submitted = row.submitted_at
    }

    // Determine new event status (using frontend type names)
    let eventStatus = 'pending'
    if (workflow.post_game_submitted) eventStatus = 'post_game_submitted'
    else if (workflow.game_ready) eventStatus = 'game_ready'
    else if (workflow.checked_in) eventStatus = 'checked_in'

    // Update event workflow status (use frontend type names)
    await query(
      'UPDATE events SET workflow_status = $1 WHERE id = $2',
      [eventStatus, eventId]
    )

    // Get staff and event names for notification log
    const staffResult = await query('SELECT full_name FROM staff WHERE id = $1', [staffId])
    const eventResult = await query('SELECT summary, venue_id FROM events WHERE id = $1', [eventId])
    const venueResult = await query('SELECT name FROM venues WHERE id = $1', [eventResult.rows[0]?.venue_id])

    const staffName = staffResult.rows[0]?.full_name || 'Unknown'
    const eventName = eventResult.rows[0]?.summary || 'Unknown Event'
    const venueName = venueResult.rows[0]?.name || 'Unknown Venue'
    const dbType = submissionType
    const timestamp = new Date().toISOString()

    // Write to notification log for OpenClaw cron
    try {
      await appendFile(
        '/tmp/anc-workflow-notifications.log',
        `WORKFLOW|${dbType}|${staffName}|${eventName}|${venueName}|${timestamp}\n`
      )
    } catch (logErr) {
      console.error('Failed to write notification log:', logErr)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      workflow,
    })
  } catch (err) {
    console.error('Error updating workflow:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
