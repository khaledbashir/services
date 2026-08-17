export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause, buildAssignmentFilterClause } from '@/lib/venue-filter'
import { formatVenueEventSummary } from '@/lib/event-display'
import { addDaysToDateKey, addMonthsToDateKey, todayInOperationsTimeZone } from '@/lib/ops-date'
import { approvedOnly, parseApprovalParam } from '@/lib/event-approval'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'all'
    // Master schedule by default. The approval queue passes ?approval=suggested.
    const approval = parseApprovalParam(searchParams.get('approval'))
    // Discovery/feed sync keeps thousands of upcoming events live (a single
    // month window holds 1,200+ rows). A 100-row cap silently dropped
    // everything more than a few days out — Stevie's "Rocket Arena events
    // missing from the dashboard" 2026-07-27. The cap is a runaway-query
    // backstop, not a page size.
    const limit = searchParams.get('limit') || '10000'

    const user = await getAuthUser(request)
    // `mine=true` forces personal-assignment scope even for admin/manager/tech_support —
    // used by the "My Assignments" view so a manager can preview their own technician load.
    const forceMine = searchParams.get('mine') === 'true' || searchParams.get('mine') === '1'
    // `preview_as=<staffId>` lets an admin/manager see exactly what a given staff
    // member would see on their own dashboard. Non-managers ignore this param.
    const previewAsStaffId = (user && (user.role === 'admin' || user.role === 'tech_support' || user.role === 'manager'))
      ? searchParams.get('preview_as')
      : null
    // Technicians should see events they are assigned to even if they are not linked
    // to the venue in staff_venues. Venue scoping still applies for managers/admins.
    const venueIds = user && user.role !== 'technician' && !forceMine && !previewAsStaffId
      ? await getStaffVenueIds(user.userId, user.role)
      : null

    let whereClause = ''
    const params: any[] = []

    const todayStr = todayInOperationsTimeZone()

    if (filter === 'today') {
      whereClause = 'WHERE e.event_date = $1'
      params.push(todayStr)
    } else if (filter === 'week') {
      const weekStr = addDaysToDateKey(todayStr, 7)
      whereClause = 'WHERE e.event_date >= $1 AND e.event_date <= $2'
      params.push(todayStr, weekStr)
    } else if (filter === 'month') {
      const monthStr = addMonthsToDateKey(todayStr, 1)
      whereClause = 'WHERE e.event_date >= $1 AND e.event_date <= $2'
      params.push(todayStr, monthStr)
    } else if (filter === 'pending_workflow') {
      whereClause = "WHERE (e.workflow_status IS NULL OR e.workflow_status = 'pending') AND e.event_date >= $1"
      params.push(todayStr)
    } else if (filter === 'all') {
      // "All" is the operational list — every upcoming event. Without a
      // lower bound the ascending sort + row cap returned the oldest rows
      // in the table (2021 history) and nothing current. Past events remain
      // reachable through the calendar view's explicit date ranges.
      whereClause = 'WHERE e.event_date >= $1'
      params.push(todayStr)
    }

    const vf = buildVenueFilterClause(venueIds, 'e.venue_id', params.length + 1)
    // If no WHERE clause yet, convert AND to WHERE
    let venueFilter = vf.clause
    if (!whereClause && venueFilter) {
      whereClause = 'WHERE ' + venueFilter.replace(/^AND /, '')
      venueFilter = ''
    }

    // Technicians only see events they are personally assigned to.
    // If `mine=true` is set we force the personal filter regardless of role
    // so /my-events works for admins viewing their own assignment load.
    const af = user
      ? (previewAsStaffId
          ? { clause: `AND e.id IN (SELECT event_id FROM event_assignments WHERE staff_id = $${params.length + vf.params.length + 1})`, params: [previewAsStaffId], nextIdx: params.length + vf.params.length + 2 }
          : forceMine
            ? { clause: `AND e.id IN (SELECT event_id FROM event_assignments WHERE staff_id = $${params.length + vf.params.length + 1})`, params: [user.userId], nextIdx: params.length + vf.params.length + 2 }
            : buildAssignmentFilterClause(user.role, user.userId, 'e.id', params.length + vf.params.length + 1))
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
        COALESCE(e.event_type, 'event') as event_type,
        e.venue_id,
        v.name as venue_name,
        COALESCE(m.name, 'Unknown') as market,
        COALESCE(v.venue_type, 'sports') as venue_type,
        c.id as client_id,
        c.name as client_name,
        e.league,
        e.source,
        e.start_time,
        COALESCE(v.timezone, 'America/New_York') as venue_timezone,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        COALESCE(e.workflow_status, 'pending') as workflow_status,
        COALESCE(e.approval_status, 'approved') as approval_status,
        e.suggestion_reason,
        e.approved_at,
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
      LEFT JOIN markets m ON v.market_id = m.id
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
        AND e.source IS NOT NULL
      )
      AND e.status <> 'cancelled'
      ${approval === 'all' ? '' : approval === 'approved' ? `AND ${approvedOnly('e')}` : `AND e.approval_status = '${approval}'`}
      GROUP BY
        e.id,
        v.name,
        m.name,
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

    // Joe 2026-04-29: venue.requires_assignment is the single source of
    // truth for staffing default. Per-event override via events.requires_staffing.
    const events = result.rows.map((row) => ({
      ...row,
      summary: formatVenueEventSummary({
        summary: row.summary,
        eventType: row.event_type,
        venueType: row.venue_type,
      }),
      venue_requires_assignment: row.venue_requires_assignment_legacy !== false,
    }))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Error fetching events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
