import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause, buildAssignmentFilterClause } from '@/lib/venue-filter'
import { addDaysToDateKey, todayInOperationsTimeZone } from '@/lib/ops-date'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    const userRole = user?.role || 'admin'
    const userId = user?.userId || ''

    const vf = buildVenueFilterClause(venueIds, 'e.venue_id', 2)
    const af = buildAssignmentFilterClause(userRole, userId, 'e.id', vf.nextIdx)
    const vfTicket = buildVenueFilterClause(venueIds, 't.venue_id', 1)

    const today = todayInOperationsTimeZone()

    const todaysEventsResult = await query(
      `SELECT COUNT(*) as count FROM events e WHERE e.event_date = $1 ${vf.clause} ${af.clause}`,
      [today, ...vf.params, ...af.params]
    )

    const assignedStaffResult = await query(
      `SELECT COUNT(DISTINCT ea.staff_id) as count FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date = $1 ${vf.clause} ${af.clause}`,
      [today, ...vf.params, ...af.params]
    )

    const openTicketsResult = await query(
      `SELECT COUNT(*) as count FROM tickets t WHERE t.status IN ('new', 'on_hold', 'in_progress', 'escalated') ${vfTicket.clause}`,
      [...vfTicket.params]
    )

    const pendingWorkflowsResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1 AND e.workflow_status = 'pending' ${vf.clause} ${af.clause}`,
      [today, ...vf.params, ...af.params]
    )

    // Estimated labor hours this week
    const weekEndStr = addDaysToDateKey(today, 7)
    const vfLabor = buildVenueFilterClause(venueIds, 'e.venue_id', 3)
    const afLabor = buildAssignmentFilterClause(userRole, userId, 'e.id', vfLabor.nextIdx)

    const laborHoursResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= $1 AND e.event_date < $2 ${vfLabor.clause} ${afLabor.clause}`,
      [today, weekEndStr, ...vfLabor.params, ...afLabor.params]
    )

    // Labor hours by staff this week
    const laborByStaffResult = await query(
      `SELECT s.id, s.full_name, SUM(ea.estimated_hours) as total_hours, COUNT(ea.id) as event_count
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date >= $1 AND e.event_date < $2 ${vfLabor.clause} ${afLabor.clause}
       GROUP BY s.id, s.full_name
       ORDER BY total_hours DESC
       LIMIT 10`,
      [today, weekEndStr, ...vfLabor.params, ...afLabor.params]
    )

    // Only sports venues run on event feeds. OOH and facility venues don't
    // have schedules to pull, so they're excluded from both auto-sync and
    // needs-feed counts (Joe confirmed 2026-05-01: "If it's an OOH venue we
    // do not need a feed URL").
    const venueAutomationResult = await query(
      `SELECT
         COUNT(*) FILTER (
           WHERE COALESCE(v.is_active, true) = true
             AND COALESCE(v.venue_type, 'sports') = 'sports'
             AND active.active_service_count > 0
             AND COALESCE(v.feed_url, '') <> ''
         )::int as auto_syncing_venues,
         COUNT(*) FILTER (
           WHERE COALESCE(v.is_active, true) = true
             AND COALESCE(v.venue_type, 'sports') = 'sports'
             AND active.active_service_count > 0
             AND COALESCE(v.feed_url, '') = ''
         )::int as venues_needing_feed_urls,
         COUNT(*) FILTER (
           WHERE COALESCE(v.is_active, true) = false
         )::int as inactive_venues
       FROM venues v
       LEFT JOIN (
         SELECT cv.venue_id, COUNT(DISTINCT cs.service_type_id)::int as active_service_count
         FROM client_venues cv
         JOIN client_services cs ON cs.client_id = cv.client_id
         WHERE cs.enabled = true
         GROUP BY cv.venue_id
       ) active ON active.venue_id = v.id`
    )

    return NextResponse.json({
      todaysEvents: parseInt(todaysEventsResult.rows[0]?.count || '0'),
      assignedStaff: parseInt(assignedStaffResult.rows[0]?.count || '0'),
      openTickets: parseInt(openTicketsResult.rows[0]?.count || '0'),
      pendingWorkflows: parseInt(pendingWorkflowsResult.rows[0]?.count || '0'),
      estimatedLaborHours: parseFloat(laborHoursResult.rows[0]?.total_hours || '0'),
      laborByStaff: laborByStaffResult.rows,
      autoSyncingVenues: parseInt(venueAutomationResult.rows[0]?.auto_syncing_venues || '0'),
      venuesNeedingFeedUrls: parseInt(venueAutomationResult.rows[0]?.venues_needing_feed_urls || '0'),
      inactiveVenues: parseInt(venueAutomationResult.rows[0]?.inactive_venues || '0'),
    })
  } catch (err) {
    console.error('Error fetching stats:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
