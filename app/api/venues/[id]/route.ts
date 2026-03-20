import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id

    // Get venue details
    const venueResult = await query(
      `SELECT 
        v.id,
        v.name,
        m.name as market_name,
        v.address,
        v.slack_channel_id,
        v.service_responsibilities,
        v.primary_contact_name,
        v.primary_contact_email
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      WHERE v.id = $1`,
      [venueId]
    )

    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const venue = venueResult.rows[0]

    // Get upcoming events (next 30 days)
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const eventsResult = await query(
      `SELECT 
        e.id,
        e.summary as event_name,
        e.league,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        e.start_time,
        e.workflow_status,
        STRING_AGG(s.full_name, ', ' ORDER BY s.full_name) as assigned_techs
      FROM events e
      LEFT JOIN event_assignments ea ON e.id = ea.event_id
      LEFT JOIN staff s ON ea.staff_id = s.id
      WHERE e.venue_id = $1 
        AND e.event_date >= $2 
        AND e.event_date <= $3
      GROUP BY e.id, e.summary, e.league, e.event_date, e.start_time, e.workflow_status
      ORDER BY e.start_time`,
      [venueId, today, thirtyDaysFromNow]
    )

    // Get assigned staff at this venue
    const staffResult = await query(
      `SELECT DISTINCT
        s.id,
        s.full_name,
        s.role
      FROM staff s
      JOIN event_assignments ea ON s.id = ea.staff_id
      JOIN events e ON ea.event_id = e.id
      WHERE e.venue_id = $1
      ORDER BY s.full_name`,
      [venueId]
    )

    return NextResponse.json({
      venue,
      upcomingEvents: eventsResult.rows,
      assignedStaff: staffResult.rows,
    })
  } catch (err) {
    console.error('Error fetching venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id
    const { slack_channel_id } = await request.json()

    const result = await query(
      `UPDATE venues 
       SET slack_channel_id = $1
       WHERE id = $2
       RETURNING 
        id,
        name,
        slack_channel_id,
        address`,
      [slack_channel_id, venueId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    // Fetch full venue data
    const fullVenue = await query(
      `SELECT 
        v.id,
        v.name,
        m.name as market_name,
        v.address,
        v.slack_channel_id,
        v.service_responsibilities,
        v.primary_contact_name,
        v.primary_contact_email
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      WHERE v.id = $1`,
      [venueId]
    )

    return NextResponse.json({ venue: fullVenue.rows[0] })
  } catch (err) {
    console.error('Error updating venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
