import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { authorizeVoiceCall } from '@/lib/elevenlabs-internal-auth'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  const today = new Date().toISOString().split('T')[0]

  try {
    const events = await dbQuery(
      `SELECT e.id, e.summary, e.event_date,
              TO_CHAR(e.event_date AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_label,
              v.name as venue_name,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.full_name), NULL) as assigned_staff
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       LEFT JOIN staff s ON s.id = ea.staff_id AND s.is_active = true
       WHERE DATE(e.event_date AT TIME ZONE 'America/New_York') = $1
       GROUP BY e.id, e.summary, e.event_date, v.name
       ORDER BY e.event_date ASC`,
      [today]
    )

    const checkedIn = await dbQuery(
      `SELECT s.id, s.full_name, s.role, te.venue_id, v.name as venue_name,
              TO_CHAR(te.clock_in AT TIME ZONE 'America/New_York', 'HH12:MI AM') as clock_in_label
       FROM time_entries te
       JOIN staff s ON s.id = te.staff_id
       LEFT JOIN venues v ON v.id = te.venue_id
       WHERE te.clock_out IS NULL
         AND DATE(te.clock_in AT TIME ZONE 'America/New_York') = $1
       ORDER BY te.clock_in DESC`,
      [today]
    ).catch(() => ({ rows: [] }))

    const eventCount = events.rows.length
    const checkedInCount = checkedIn.rows.length
    const venueCount = new Set(events.rows.map(r => r.venue_name).filter(Boolean)).size

    const voiceBrief = [
      `${eventCount} event${eventCount === 1 ? '' : 's'} on the books today across ${venueCount} venue${venueCount === 1 ? '' : 's'}.`,
      checkedInCount ? `${checkedInCount} staff currently clocked in.` : 'Nobody clocked in right now.',
      events.rows[0]
        ? `Next up: ${events.rows[0].summary} at ${events.rows[0].venue_name || 'unspecified venue'}, ${events.rows[0].start_label}.`
        : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      caller: auth.staff?.fullName || null,
      date: today,
      counts: { events: eventCount, venues: venueCount, checkedIn: checkedInCount },
      events: events.rows.map(r => ({
        id: r.id,
        summary: r.summary,
        venue: r.venue_name,
        startLabel: r.start_label,
        assignedStaff: r.assigned_staff || [],
      })),
      checkedIn: checkedIn.rows.map(r => ({
        staffId: r.id,
        name: r.full_name,
        role: r.role,
        venue: r.venue_name,
        clockInLabel: r.clock_in_label,
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('voice staff-today error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'staff_today_failed' },
      { status: 500 }
    )
  }
}
