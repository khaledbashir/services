import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') // YYYY-MM-DD
    const end = searchParams.get('end') // YYYY-MM-DD

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end parameters required' }, { status: 400 })
    }

    const result = await query(
      `SELECT
        e.id,
        e.summary,
        e.league,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as date,
        TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as time,
        v.name as venue,
        e.workflow_status,
        (SELECT count(*) FROM event_assignments ea WHERE ea.event_id = e.id) as assigned_count,
        (SELECT STRING_AGG(s.full_name, ', ') FROM event_assignments ea JOIN staff s ON ea.staff_id = s.id WHERE ea.event_id = e.id) as assigned_techs
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE e.event_date BETWEEN $1 AND $2
      ORDER BY e.start_time`,
      [start, end]
    )

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('Error fetching calendar events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
