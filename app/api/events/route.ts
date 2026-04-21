import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause, buildAssignmentFilterClause } from '@/lib/venue-filter'
import { computeRequiresStaffingFromRow } from '@/lib/client-automation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'all'
    const limit = searchParams.get('limit') || '100'

    const user = await getAuthUser(request)
    // Technicians should see events they are assigned to even if they are not linked
    // to the venue in staff_venues. Venue scoping still applies for managers/admins.
    const venueIds = user && user.role !== 'technician'
      ? await getStaffVenueIds(user.userId, user.role)
      : null

    let whereClause = ''
    const params: any[] = []

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    if (filter === 'today') {
      whereClause = 'WHERE e.event_date = $1'
      params.push(todayStr)
    } else if (filter === 'week') {
      const weekFromNow = new Date(today)
      weekFromNow.setDate(weekFromNow.getDate() + 7)
      const weekStr = weekFromNow.toISOString().split('T')[0]
      whereClause = 'WHERE e.event_date >= $1 AND e.event_date <= $2'
      params.push(todayStr, weekStr)
    } else if (filter === 'month') {
      const monthFromNow = new Date(today)
      monthFromNow.setMonth(monthFromNow.getMonth() + 1)
      const monthStr = monthFromNow.toISOString().split('T')[0]
      whereClause = 'WHERE e.event_date >= $1 AND e.event_date <= $2'
      params.push(todayStr, monthStr)
    } else if (filter === 'pending_workflow') {
      whereClause = "WHERE (e.workflow_status IS NULL OR e.workflow_status = 'pending') AND e.event_date >= $1"
      params.push(todayStr)
    }

    const vf = buildVenueFilterClause(venueIds, 'e.venue_id', params.length + 1)
    // If no WHERE clause yet, convert AND to WHERE
    let venueFilter = vf.clause
    if (!whereClause && venueFilter) {
      whereClause = 'WHERE ' + venueFilter.replace(/^AND /, '')
      venueFilter = ''
    }

    // Technicians only see events they are personally assigned to
    const af = user
      ? buildAssignmentFilterClause(user.role, user.userId, 'e.id', params.length + vf.params.length + 1)
      : { clause: '', params: [], nextIdx: params.length + vf.params.length + 1 }
    let assignmentFilter = af.clause
    if (!whereClause && assignmentFilter) {
      whereClause = 'WHERE ' + assignmentFilter.replace(/^AND /, '')
      assignmentFilter = ''
    }

    const limitIndex = params.length + vf.params.length + af.params.length + 1
    const result = await query(
      `SELECT
        e.id,
        e.summary,
        v.name as venue_name,
        c.id as client_id,
        c.name as client_name,
        e.league,
        e.source,
        e.start_time,
        COALESCE(v.timezone, 'America/New_York') as venue_timezone,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        COALESCE(e.workflow_status, 'pending') as workflow_status,
        e.requires_staffing as event_requires_staffing,
        COALESCE(client_automation.active_service_names, '{}') as client_service_names,
        COALESCE(client_automation.active_service_descriptions, '{}') as client_service_descriptions,
        COALESCE(client_automation.active_service_count, 0) as client_service_count,
        COALESCE(venue_automation.active_service_names, '{}') as venue_service_names,
        COALESCE(venue_automation.active_service_descriptions, '{}') as venue_service_descriptions,
        COALESCE(venue_automation.active_service_count, 0) as venue_service_count,
        COALESCE(v.requires_assignment, true) as venue_requires_assignment_legacy,
        COUNT(ea.id)::int as assigned_count,
        STRING_AGG(s.full_name, ', ') as assigned_techs
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN clients c ON e.client_id = c.id
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
      LEFT JOIN event_assignments ea ON e.id = ea.event_id
      LEFT JOIN staff s ON ea.staff_id = s.id
      ${whereClause} ${venueFilter} ${assignmentFilter}
      ${whereClause || venueFilter || assignmentFilter ? 'AND' : 'WHERE'}
      NOT (
        COALESCE(v.venue_type, 'sports') <> 'sports'
        AND COALESCE(e.event_type, 'event') = 'game'
      )
      GROUP BY
        e.id,
        v.name,
        c.id,
        c.name,
        v.requires_assignment,
        v.venue_type,
        v.timezone,
        client_automation.active_service_names,
        client_automation.active_service_descriptions,
        client_automation.active_service_count,
        venue_automation.active_service_names,
        venue_automation.active_service_descriptions,
        venue_automation.active_service_count
      ORDER BY e.start_time ASC
      LIMIT $${limitIndex}`,
      [...params, ...vf.params, ...af.params, parseInt(limit)]
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

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Error fetching events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
