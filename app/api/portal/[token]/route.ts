import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
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

    // Upcoming events with workflow timeline
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

    // Past events with workflow timeline
    const pastEventsResult = await query(
      `SELECT e.id, e.summary, e.league,
              TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
              e.workflow_status
       FROM events e
       WHERE e.venue_id = $1 AND e.event_date < $2 AND e.event_date >= $2::date - 30
       ORDER BY e.event_date DESC, e.start_time DESC
       LIMIT 30`,
      [venue.id, today]
    )

    // Workflow timelines for all events (past 30 days + upcoming)
    const workflowResult = await query(
      `SELECT ws.event_id, ws.type,
              TO_CHAR(ws.submitted_at AT TIME ZONE 'America/New_York', 'Mon DD, HH12:MI AM') as submitted_at
       FROM workflow_submissions ws
       JOIN events e ON ws.event_id = e.id
       WHERE e.venue_id = $1 AND e.event_date >= $2::date - 30
       ORDER BY ws.submitted_at`,
      [venue.id, today]
    )

    // Group workflows by event
    const workflowsByEvent: Record<string, any[]> = {}
    for (const w of workflowResult.rows) {
      if (!workflowsByEvent[w.event_id]) workflowsByEvent[w.event_id] = []
      workflowsByEvent[w.event_id].push({ type: w.type, submitted_at: w.submitted_at })
    }

    // Tickets
    const ticketsResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.priority, t.status,
              t.resolution_notes,
              TO_CHAR(t.created_at, 'Mon DD, YYYY') as created_at,
              TO_CHAR(t.resolved_at, 'Mon DD, YYYY') as resolved_at
       FROM tickets t
       WHERE t.venue_id = $1
       ORDER BY CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT 30`,
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

    // Service level stats
    const statsResult = await query(
      `SELECT
        COUNT(CASE WHEN e.event_date >= $2 AND e.event_date <= $3 THEN 1 END) as upcoming_events,
        COUNT(CASE WHEN e.event_date < $2 AND e.event_date >= $2::date - 30 THEN 1 END) as past_month_events,
        COUNT(CASE WHEN e.event_date < $2 AND e.event_date >= $2::date - 30 AND e.workflow_status = 'post_game_submitted' THEN 1 END) as completed_events
       FROM events e
       WHERE e.venue_id = $1`,
      [venue.id, today, thirtyDays]
    )

    // Average ticket resolution time
    const resolutionResult = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours
       FROM tickets
       WHERE venue_id = $1 AND resolved_at IS NOT NULL AND created_at > NOW() - INTERVAL '90 days'`,
      [venue.id]
    )

    const pastMonth = parseInt(statsResult.rows[0]?.past_month_events || '0')
    const completed = parseInt(statsResult.rows[0]?.completed_events || '0')
    const openTickets = ticketsResult.rows.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length
    const avgResolution = resolutionResult.rows[0]?.avg_hours ? Math.round(parseFloat(resolutionResult.rows[0].avg_hours) * 10) / 10 : null

    // Installed screens/specs
    const screensResult = await query(
      `SELECT display_name, manufacturer, model, pixel_pitch, width_ft, height_ft,
              brightness_nits, environment, location_zone, is_active
       FROM venue_screens
       WHERE venue_id = $1 AND is_active = true
       ORDER BY display_name`,
      [venue.id]
    )

    return NextResponse.json({
      venue,
      upcomingEvents: eventsResult.rows,
      pastEvents: pastEventsResult.rows,
      workflowsByEvent,
      tickets: ticketsResult.rows,
      services: servicesResult.rows,
      screens: screensResult.rows,
      stats: {
        upcomingEvents: parseInt(statsResult.rows[0]?.upcoming_events || '0'),
        pastMonthEvents: pastMonth,
        completedEvents: completed,
        completionRate: pastMonth > 0 ? Math.round((completed / pastMonth) * 100) : 100,
        openTickets,
        avgResolutionHours: avgResolution,
      },
    })
  } catch (err) {
    console.error('Error fetching portal data:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
