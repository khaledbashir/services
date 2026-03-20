import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate token and get venue
    const venueResult = await query(
      `SELECT v.id, v.name, v.address, v.primary_contact_name, v.primary_contact_email,
              v.requires_assignment, m.name as market
       FROM venues v
       LEFT JOIN markets m ON v.market_id = m.id
       WHERE v.portal_token = $1`,
      [params.token]
    )

    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal link' }, { status: 404 })
    }

    const venue = venueResult.rows[0]
    const today = new Date().toISOString().split('T')[0]
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Upcoming events (next 30 days)
    const eventsResult = await query(
      `SELECT e.id, e.summary, e.league,
              TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
              e.workflow_status,
              (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id) as staff_count
       FROM events e
       WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $3
       ORDER BY e.event_date, e.start_time`,
      [venue.id, today, thirtyDays]
    )

    // Recent past events (last 14 days) with workflow status
    const pastEventsResult = await query(
      `SELECT e.id, e.summary, e.league,
              TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
              e.workflow_status
       FROM events e
       WHERE e.venue_id = $1 AND e.event_date < $2 AND e.event_date >= $2::date - 14
       ORDER BY e.event_date DESC, e.start_time DESC
       LIMIT 20`,
      [venue.id, today]
    )

    // Open tickets (external view only)
    const ticketsResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.category, t.priority, t.status,
              TO_CHAR(t.created_at, 'Mon DD, YYYY') as created_at,
              TO_CHAR(t.resolved_at, 'Mon DD, YYYY') as resolved_at
       FROM tickets t
       WHERE t.venue_id = $1
       ORDER BY CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT 20`,
      [venue.id]
    )

    // Contracted services
    const servicesResult = await query(
      `SELECT st.name, st.description, COALESCE(vs.enabled, false) as enabled
       FROM service_types st
       LEFT JOIN venue_services vs ON st.id = vs.service_type_id AND vs.venue_id = $1
       WHERE COALESCE(vs.enabled, false) = true
       ORDER BY st.name`,
      [venue.id]
    )

    // Stats
    const statsResult = await query(
      `SELECT
        COUNT(CASE WHEN e.event_date >= $2 AND e.event_date <= $3 THEN 1 END) as upcoming_events,
        COUNT(CASE WHEN e.event_date < $2 AND e.event_date >= $2::date - 30 THEN 1 END) as past_month_events,
        COUNT(CASE WHEN e.event_date < $2 AND e.event_date >= $2::date - 30 AND e.workflow_status = 'post_game_submitted' THEN 1 END) as completed_events
       FROM events e
       WHERE e.venue_id = $1`,
      [venue.id, today, thirtyDays]
    )

    const openTickets = ticketsResult.rows.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length

    return NextResponse.json({
      venue,
      upcomingEvents: eventsResult.rows,
      pastEvents: pastEventsResult.rows,
      tickets: ticketsResult.rows,
      services: servicesResult.rows,
      stats: {
        upcomingEvents: parseInt(statsResult.rows[0]?.upcoming_events || '0'),
        pastMonthEvents: parseInt(statsResult.rows[0]?.past_month_events || '0'),
        completedEvents: parseInt(statsResult.rows[0]?.completed_events || '0'),
        openTickets,
      },
    })
  } catch (err) {
    console.error('Error fetching portal data:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
