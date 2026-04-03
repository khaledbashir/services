import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause, buildAssignmentFilterClause } from '@/lib/venue-filter'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'all'
    const limit = searchParams.get('limit') || '100'

    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null

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
        e.league,
        e.start_time,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        COALESCE(e.workflow_status, 'pending') as workflow_status,
        e.requires_staffing as event_requires_staffing,
        COALESCE(v.requires_assignment, true) as venue_requires_assignment,
        COUNT(ea.id)::int as assigned_count,
        STRING_AGG(s.full_name, ', ') as assigned_techs
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN event_assignments ea ON e.id = ea.event_id
      LEFT JOIN staff s ON ea.staff_id = s.id
      ${whereClause} ${venueFilter} ${assignmentFilter}
      GROUP BY e.id, v.name, v.requires_assignment
      ORDER BY e.start_time ASC
      LIMIT $${limitIndex}`,
      [...params, ...vf.params, ...af.params, parseInt(limit)]
    )

    return NextResponse.json({ events: result.rows })
  } catch (err) {
    console.error('Error fetching events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
