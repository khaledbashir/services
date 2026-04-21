import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { computeRequiresStaffingFromRow } from '@/lib/client-automation'

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
        e.source,
        c.name as client_name,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as date,
        TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone, 'America/New_York'), 'HH12:MI AM') as time,
        v.name as venue, v.name as venue_name,
        COALESCE(v.timezone, 'America/New_York') as venue_timezone,
        e.workflow_status,
        e.requires_staffing as event_requires_staffing,
        COALESCE(v.requires_assignment, true) as venue_requires_assignment_legacy,
        COALESCE(client_automation.active_service_names, '{}') as client_service_names,
        COALESCE(client_automation.active_service_descriptions, '{}') as client_service_descriptions,
        COALESCE(client_automation.active_service_count, 0) as client_service_count,
        COALESCE(venue_automation.active_service_names, '{}') as venue_service_names,
        COALESCE(venue_automation.active_service_descriptions, '{}') as venue_service_descriptions,
        COALESCE(venue_automation.active_service_count, 0) as venue_service_count,
        (SELECT count(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int as assigned_count,
        (SELECT STRING_AGG(s.full_name, ', ') FROM event_assignments ea JOIN staff s ON ea.staff_id = s.id WHERE ea.event_id = e.id) as assigned_techs
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN clients c ON c.id = e.client_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT CASE WHEN cs.enabled = true THEN st.id END)::int as active_service_count,
          COALESCE(array_remove(array_agg(DISTINCT CASE WHEN cs.enabled = true THEN st.name END), NULL), '{}') as active_service_names,
          COALESCE(array_remove(array_agg(DISTINCT CASE WHEN cs.enabled = true THEN COALESCE(st.description, '') END), NULL), '{}') as active_service_descriptions
        FROM client_services cs
        LEFT JOIN service_types st ON st.id = cs.service_type_id
        WHERE cs.client_id = e.client_id
      ) client_automation ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT CASE WHEN cs.enabled = true THEN st.id END)::int as active_service_count,
          COALESCE(array_remove(array_agg(DISTINCT CASE WHEN cs.enabled = true THEN st.name END), NULL), '{}') as active_service_names,
          COALESCE(array_remove(array_agg(DISTINCT CASE WHEN cs.enabled = true THEN COALESCE(st.description, '') END), NULL), '{}') as active_service_descriptions
        FROM client_venues cv
        LEFT JOIN client_services cs ON cs.client_id = cv.client_id
        LEFT JOIN service_types st ON st.id = cs.service_type_id
        WHERE cv.venue_id = e.venue_id
      ) venue_automation ON TRUE
      WHERE e.event_date BETWEEN $1 AND $2
        AND NOT (
          COALESCE(v.venue_type, 'sports') <> 'sports'
          AND COALESCE(e.event_type, 'event') = 'game'
        )
      ORDER BY e.start_time`,
      [start, end]
    )

    const events = result.rows.map((row) => {
      const clientDefault = computeRequiresStaffingFromRow({
        active_service_names: row.client_service_names,
        active_service_descriptions: row.client_service_descriptions,
        active_service_count: row.client_service_count,
      })
      const venueDefault = computeRequiresStaffingFromRow({
        active_service_names: row.venue_service_names,
        active_service_descriptions: row.venue_service_descriptions,
        active_service_count: row.venue_service_count,
      })
      return {
        ...row,
        venue_requires_assignment: row.client_name
          ? clientDefault
          : (Number(row.venue_service_count || 0) > 0 ? venueDefault : row.venue_requires_assignment_legacy !== false),
      }
    })

    return NextResponse.json(events)
  } catch (err) {
    console.error('Error fetching calendar events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
