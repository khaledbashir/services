export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { approvedOnly } from '@/lib/event-approval'
import { getPortalSession, getScopedPortalVenueIds } from '@/lib/portal-auth'
import { buildEventReadiness } from '@/lib/event-readiness'

/**
 * The client's event schedule, scoped to the venues they are granted.
 *
 * Charlie 2026-08-10: "this way client can see if they have an event for that
 * day, and maybe see what they have lined up for the week."
 *
 * Returns today and the following seven days, each with its game-day progress.
 * Charlie attached the internal Workflow Progress panel and said "basically it
 * will show this in the event tab", so the three milestones — checked in, game
 * ready, post-game — travel with each event.
 *
 * What does NOT travel with them: which technician submitted each step, the
 * submission payload (extra timesheets, auditor), staffing flags and
 * escalation timestamps. The client sees that their building is ready, not how
 * ANC staffed it.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getScopedPortalVenueIds(
      session,
      request.nextUrl.searchParams.get('venue')
    )
    if (venueIds.length === 0) return NextResponse.json({ today: [], upcoming: [] })

    const requestedDays = Number.parseInt(request.nextUrl.searchParams.get('days') || '7', 10)
    const days = Math.min(60, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 7))

    const result = await query(
      `SELECT e.id, e.summary, e.league, e.event_date, e.start_time, e.end_time,
              e.status, e.event_type, v.name AS venue_name
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE e.venue_id = ANY($1::uuid[])
         AND e.event_date >= CURRENT_DATE
         AND e.event_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
         AND LOWER(COALESCE(e.status, '')) <> 'cancelled'
         AND ${approvedOnly('e')}
       ORDER BY e.event_date, e.start_time`,
      [venueIds, days]
    )

    const eventIds = result.rows.map((row: any) => row.id)
    const submissions = eventIds.length
      ? (await query(
          `SELECT event_id, type, submitted_at
           FROM workflow_submissions
           WHERE event_id = ANY($1::uuid[])`,
          [eventIds]
        )).rows
      : []

    const byEvent = new Map<string, any[]>()
    for (const submission of submissions) {
      const list = byEvent.get(submission.event_id) || []
      list.push(submission)
      byEvent.set(submission.event_id, list)
    }

    const rows = result.rows.map((row: any) => ({
      id: row.id,
      summary: row.summary,
      league: row.league,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      event_type: row.event_type,
      venue_name: row.venue_name,
      readiness: buildEventReadiness(byEvent.get(row.id) || []),
    }))

    // "Today" is computed from the same date column the query filtered on, so
    // the split can never disagree with the ordering.
    const todayKey = new Date().toISOString().slice(0, 10)
    const dateKey = (value: any) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

    return NextResponse.json({
      today: rows.filter((r) => dateKey(r.event_date) === todayKey),
      upcoming: rows.filter((r) => dateKey(r.event_date) !== todayKey),
      days,
    })
  } catch (err) {
    console.error('Portal events error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
