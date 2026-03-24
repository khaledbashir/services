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

    // Build start/end timestamps from date + time
    const startTimestamp = start_time
      ? `${event_date}T${start_time}:00`
      : `${event_date}T00:00:00`
    // Default end_time to start + 3 hours if not provided (DB has NOT NULL constraint)
    let endTimestamp: string
    if (end_time) {
      endTimestamp = `${event_date}T${end_time}:00`
    } else if (start_time) {
      const [h, m] = start_time.split(':').map(Number)
      const endH = String((h + 3) % 24).padStart(2, '0')
      endTimestamp = `${event_date}T${endH}:${String(m).padStart(2, '0')}:00`
    } else {
      endTimestamp = `${event_date}T03:00:00`
    }

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
