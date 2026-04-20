import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'
import { buildEventTimestamps } from '@/lib/timezone'
import { syncEventsToTwenty } from '@/lib/twenty-sync'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { summary, event_date, start_time, end_time, venue_id, league, staff_ids, event_type } = await request.json()

    if (!summary || !event_date || !venue_id) {
      return NextResponse.json({ error: 'Event name, date, and venue are required' }, { status: 400 })
    }

    // Interpret start/end wall-clock times in the venue's timezone so the DB
    // stores the correct UTC instant (events.start_time is timestamptz).
    const venueTzRes = await query(`SELECT timezone FROM venues WHERE id = $1`, [venue_id])
    const venueTimezone = venueTzRes.rows[0]?.timezone || 'America/New_York'
    const { startUtc, endUtc } = buildEventTimestamps(event_date, start_time || null, end_time || null, venueTimezone)

    const validEventTypes = ['event', 'shift']
    const eType = validEventTypes.includes(event_type) ? event_type : 'event'

    const result = await query(
      `INSERT INTO events (summary, event_date, start_time, end_time, venue_id, league, workflow_status, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [summary, event_date, startUtc, endUtc, venue_id, league || null, eType]
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

    const venueRes = await query('SELECT name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const venueName = venueRes.rows[0]?.name || 'Unknown'
    const venueChannel = venueRes.rows[0]?.slack_channel_id
    const staffCount = staff_ids?.length || 0
    notifyOps(':calendar:', `*New event created:* ${summary} — ${event_date} at ${venueName}${staffCount > 0 ? ` (${staffCount} staff assigned)` : ''}`, { label: 'View Event', url: `https://abc-anc-services.izcgmb.easypanel.host/events/${eventId}` }, venueChannel)

    // --- CRM SYNC: push new event to Twenty ---
    ;(async () => {
      try {
        // Get assigned tech names for sync
        let assignedTechs = ''
        if (staff_ids?.length) {
          const techRes = await query(
            `SELECT string_agg(s.full_name, ', ') as names FROM staff s WHERE s.id = ANY($1::uuid[])`,
            [staff_ids]
          )
          assignedTechs = techRes.rows[0]?.names || ''
        }
        await syncEventsToTwenty([{
          id: eventId,
          name: summary,
          event_date: event_date,
          venue_name: venueName,
          venue_id: venue_id,
          league: league || '',
          workflow_status: 'pending',
          assigned_techs: assignedTechs,
          summary: summary,
          start_time: start_time || '',
        }])
      } catch (crmErr) {
        console.error('[twenty] event create sync error:', crmErr)
      }
    })()

    return NextResponse.json({ id: eventId })
  } catch (err) {
    console.error('Error creating event:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
