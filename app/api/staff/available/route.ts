import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')

    const today = new Date().toISOString().split('T')[0]
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const result = await query(
      `SELECT s.id, s.full_name, s.role,
              COALESCE(wk.hours, 0) as week_hours,
              COALESCE(wk.events, 0) as week_events,
              CASE WHEN sv.staff_id IS NOT NULL THEN true ELSE false END as linked_to_venue
       FROM staff s
       LEFT JOIN (
         SELECT ea.staff_id,
                SUM(ea.estimated_hours) as hours,
                COUNT(*) as events
         FROM event_assignments ea
         JOIN events e ON ea.event_id = e.id
         WHERE e.event_date >= $1 AND e.event_date < $2
         GROUP BY ea.staff_id
       ) wk ON s.id = wk.staff_id
       LEFT JOIN staff_venues sv ON s.id = sv.staff_id AND sv.venue_id = $3
       WHERE s.is_active = true
       ORDER BY linked_to_venue DESC, s.full_name`,
      [today, weekEndStr, venueId || '00000000-0000-0000-0000-000000000000']
    )

    return NextResponse.json({ staff: result.rows })
  } catch (err) {
    console.error('Error fetching available staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
