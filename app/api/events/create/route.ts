import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { summary, event_date, start_time, end_time, venue_id, league, staff_ids, event_type } = await request.json()

    if (!summary || !event_date || !venue_id) {
      return NextResponse.json({ error: 'Event name, date, and venue are required' }, { status: 400 })
    }

    // Ensure event_type column exists (for shift vs event distinction)
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'event'`).catch(() => {})

    // Build start/end timestamps from date + time
    const startTimestamp = start_time
      ? `${event_date}T${start_time}:00`
      : `${event_date}T00:00:00`
    const endTimestamp = end_time
      ? `${event_date}T${end_time}:00`
      : null

    const validEventTypes = ['event', 'shift']
    const eType = validEventTypes.includes(event_type) ? event_type : 'event'

    const result = await query(
      `INSERT INTO events (summary, event_date, start_time, end_time, venue_id, league, workflow_status, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [summary, event_date, startTimestamp, endTimestamp, venue_id, league || null, eType]
    )

    const eventId = result.rows[0].id

    // Assign staff if provided
    if (staff_ids && Array.isArray(staff_ids) && staff_ids.length > 0) {
      // Get estimated hours from league settings
      let estimatedHours = 7
      if (league) {
        const leagueResult = await query(
          `SELECT estimated_hours FROM league_settings WHERE league = $1`,
          [league]
        )
        if (leagueResult.rows.length > 0) {
          estimatedHours = parseFloat(leagueResult.rows[0].estimated_hours)
        }
      }

      for (const staffId of staff_ids) {
        await query(
          `INSERT INTO event_assignments (event_id, staff_id, estimated_hours) VALUES ($1, $2, $3)`,
          [eventId, staffId, estimatedHours]
        )
      }
    }

    return NextResponse.json({ id: eventId })
  } catch (err) {
    console.error('Error creating event:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
