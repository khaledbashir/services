export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { syncEventsToTwenty, syncTicketsToTwenty, syncTechniciansToTwenty } from '@/lib/twenty-sync'

/**
 * Full sync: Push ALL events and tickets to Twenty CRM
 * Use this for the initial backfill, then rely on the 15-minute incremental sync.
 *
 * GET /api/cron/sync-twenty/full?type=events|tickets|all
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const syncType = searchParams.get('type') || 'all'

    const results: Record<string, unknown> = {}

    if (syncType === 'events' || syncType === 'all') {
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
        WHERE COALESCE(e.approval_status, 'approved') = 'approved'
        GROUP BY e.id, e.name, e.start_time, v.name, e.venue_id, e.league, e.workflow_status
        ORDER BY e.start_time DESC
      `)

      const eventSync = await syncEventsToTwenty(eventsResult.rows)
      results.events = {
        total: eventsResult.rows.length,
        synced: eventSync.synced,
        updated: eventSync.updated,
        errors: eventSync.errors,
        venueMatches: eventSync.venueMatches,
        venueUnmatched: eventSync.venueUnmatched,
      }
    }

    if (syncType === 'tickets' || syncType === 'all') {
      const ticketsResult = await query(`
        SELECT
          t.id,
          t.title,
          t.ticket_number,
          t.status,
          t.priority,
          t.category,
          v.name as venue_name,
          t.venue_id,
          s.name as assigned_to,
          t.description,
          t.resolution_notes
        FROM tickets t
        LEFT JOIN venues v ON v.id = t.venue_id
        LEFT JOIN staff s ON s.id = t.assigned_to
        ORDER BY t.updated_at DESC
      `)

      const ticketSync = await syncTicketsToTwenty(ticketsResult.rows)
      results.tickets = {
        total: ticketsResult.rows.length,
        synced: ticketSync.synced,
        updated: ticketSync.updated,
        errors: ticketSync.errors,
        venueMatches: ticketSync.venueMatches,
        venueUnmatched: ticketSync.venueUnmatched,
      }
    }

    if (syncType === 'technicians' || syncType === 'all') {
      const staffResult = await query(`
        SELECT s.id, s.name as full_name, s.email, s.phone, s.role, s.title, s.city,
          (SELECT sv.venue_id::text FROM staff_venues sv WHERE sv.staff_id = s.id LIMIT 1) as venue_id
        FROM staff s
        ORDER BY s.name
      `)

      const techSync = await syncTechniciansToTwenty(staffResult.rows)
      results.technicians = {
        total: staffResult.rows.length,
        synced: techSync.synced,
        updated: techSync.updated,
        errors: techSync.errors,
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error('Twenty CRM full sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Full sync failed' },
      { status: 500 }
    )
  }
}
