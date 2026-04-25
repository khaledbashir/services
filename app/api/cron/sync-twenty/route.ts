import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { syncEventsToTwenty, syncTicketsToTwenty, syncTechniciansToTwenty } from '@/lib/twenty-sync'

/**
 * Cron: Sync events and tickets to Twenty CRM
 * Schedule: Every 15 minutes
 *
 * - Syncs recent/updated events to Twenty VenueEvents
 * - Syncs recent/updated tickets to Twenty ServiceTickets
 * - Sets venueId relation by matching venue name
 * - Preserves ticketSource from the dashboard ticket origin
 * - Sets staffingRequired = true on events with assigned techs
 */
export async function GET() {
  try {
    // Fetch events updated in the last 30 minutes (overlap window for safety)
    const eventsResult = await query(`
      SELECT
        e.id,
        e.name,
        e.start_time::text as event_date,
        v.name as venue_name,
        e.venue_id,
        e.league,
        e.workflow_status,
        STRING_AGG(s.name, ', ') as assigned_techs,
        e.name as summary,
        e.start_time::text as start_time
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
      LEFT JOIN event_assignments ea ON ea.event_id = e.id
      LEFT JOIN staff s ON s.id = ea.staff_id
      WHERE e.updated_at >= NOW() - INTERVAL '30 minutes'
         OR e.created_at >= NOW() - INTERVAL '30 minutes'
      GROUP BY e.id, e.name, e.start_time, v.name, e.venue_id, e.league, e.workflow_status
      ORDER BY e.start_time DESC
      LIMIT 200
    `)

    // Fetch tickets updated in the last 30 minutes
    const ticketsResult = await query(`
      SELECT
        t.id,
        t.title,
        t.ticket_number,
        t.status,
        t.priority,
        t.category,
        t.source,
        v.name as venue_name,
        t.venue_id,
        s.name as assigned_to,
        t.description,
        t.resolution_notes
      FROM tickets t
      LEFT JOIN venues v ON v.id = t.venue_id
      LEFT JOIN staff s ON s.id = t.assigned_to
      WHERE t.updated_at >= NOW() - INTERVAL '30 minutes'
         OR t.created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY t.updated_at DESC
      LIMIT 200
    `)

    // Fetch staff updated in the last 30 minutes
    const staffResult = await query(`
      SELECT s.id, s.name as full_name, s.email, s.phone, s.role, s.title, s.city,
        (SELECT sv.venue_id::text FROM staff_venues sv WHERE sv.staff_id = s.id LIMIT 1) as venue_id
      FROM staff s
      WHERE s.updated_at >= NOW() - INTERVAL '30 minutes'
         OR s.created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY s.name
      LIMIT 100
    `)

    const eventSync = await syncEventsToTwenty(eventsResult.rows)
    const ticketSync = await syncTicketsToTwenty(ticketsResult.rows)
    const techSync = await syncTechniciansToTwenty(staffResult.rows)

    // Log the sync run
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('twenty_crm_sync', 'system', NULL, NULL, $1)`,
      [JSON.stringify({
        events: {
          queried: eventsResult.rows.length,
          synced: eventSync.synced,
          updated: eventSync.updated,
          errors: eventSync.errors,
          venueMatches: eventSync.venueMatches,
        },
        tickets: {
          queried: ticketsResult.rows.length,
          synced: ticketSync.synced,
          updated: ticketSync.updated,
          errors: ticketSync.errors,
          venueMatches: ticketSync.venueMatches,
        },
        technicians: {
          queried: staffResult.rows.length,
          synced: techSync.synced,
          updated: techSync.updated,
          errors: techSync.errors,
        },
      })]
    )

    return NextResponse.json({
      success: true,
      events: {
        queried: eventsResult.rows.length,
        synced: eventSync.synced,
        updated: eventSync.updated,
        errors: eventSync.errors,
        venueMatches: eventSync.venueMatches,
        venueUnmatched: eventSync.venueUnmatched,
      },
      tickets: {
        queried: ticketsResult.rows.length,
        synced: ticketSync.synced,
        updated: ticketSync.updated,
        errors: ticketSync.errors,
        venueMatches: ticketSync.venueMatches,
        venueUnmatched: ticketSync.venueUnmatched,
      },
      technicians: {
        queried: staffResult.rows.length,
        synced: techSync.synced,
        updated: techSync.updated,
        errors: techSync.errors,
      },
    })
  } catch (err) {
    console.error('Twenty CRM sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Twenty CRM sync failed' },
      { status: 500 }
    )
  }
}
