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

    const today = todayInOperationsTimeZone()
    const now = new Date()
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const alerts: Array<{ type: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; count?: number }> = []

    // 1. Events today with no staff assigned
    const unassignedResult = await query(
      `SELECT COUNT(*) as count FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.event_date = $1
         AND v.requires_assignment = true
         AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id) ${vf.clause} ${af.clause}`,
      [today, ...vf.params, ...af.params]
    )
    const unassigned = parseInt(unassignedResult.rows[0]?.count || '0')
    if (unassigned > 0) {
      alerts.push({
        type: 'unassigned',
        severity: 'critical',
        title: `${unassigned} event${unassigned > 1 ? 's' : ''} today with no staff assigned`,
        detail: 'These events require assignment but have no technicians',
        count: unassigned,
      })
    }

    // 2. Events starting within 2 hours with pending workflow (no check-in)
    const vf2 = buildVenueFilterClause(venueIds, 'e.venue_id', 3)
    const af2 = buildAssignmentFilterClause(userRole, userId, 'e.id', vf2.nextIdx)
    const noCheckinResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.start_time <= $2
         AND e.workflow_status = 'pending'
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id) ${vf2.clause} ${af2.clause}`,
      [today, twoHoursFromNow.toISOString(), ...vf2.params, ...af2.params]
    )
    const noCheckin = parseInt(noCheckinResult.rows[0]?.count || '0')
    if (noCheckin > 0) {
      alerts.push({
        type: 'no_checkin',
        severity: 'critical',
        title: `${noCheckin} event${noCheckin > 1 ? 's' : ''} starting soon with no check-in`,
        detail: 'Staff assigned but haven\'t checked in yet — game starts within 2 hours',
        count: noCheckin,
      })
    }

    // 3. Events today still in checked_in (not game ready) within 1 hour of start
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const vf3 = buildVenueFilterClause(venueIds, 'e.venue_id', 3)
    const af3 = buildAssignmentFilterClause(userRole, userId, 'e.id', vf3.nextIdx)
    const notReadyResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.start_time <= $2
         AND e.workflow_status = 'checked_in' ${vf3.clause} ${af3.clause}`,
      [today, oneHourFromNow.toISOString(), ...vf3.params, ...af3.params]
    )
    const notReady = parseInt(notReadyResult.rows[0]?.count || '0')
    if (notReady > 0) {
      alerts.push({
        type: 'not_game_ready',
        severity: 'warning',
        title: `${notReady} event${notReady > 1 ? 's' : ''} not yet game ready`,
        detail: 'Tech checked in but hasn\'t confirmed game readiness — starting within 1 hour',
        count: notReady,
      })
    }

    // 4. Overdue post-game reports (events from yesterday that never got post-game submitted)
    const yesterdayStr = addDaysToDateKey(today, -1)
    const vf4 = buildVenueFilterClause(venueIds, 'e.venue_id', 2)
    const af4 = buildAssignmentFilterClause(userRole, userId, 'e.id', vf4.nextIdx)
    const overdueResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.workflow_status != 'post_game_submitted'
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id) ${vf4.clause} ${af4.clause}`,
      [yesterdayStr, ...vf4.params, ...af4.params]
    )
    const overdue = parseInt(overdueResult.rows[0]?.count || '0')
    if (overdue > 0) {
      alerts.push({
        type: 'overdue_report',
        severity: 'warning',
        title: `${overdue} overdue post-game report${overdue > 1 ? 's' : ''} from yesterday`,
        detail: 'Events from yesterday that never received a post-game report',
        count: overdue,
      })
    }

    // 5. Events this week with partial assignment (some but not all need techs)
    const weekEndStr = addDaysToDateKey(today, 7)
    const vf5 = buildVenueFilterClause(venueIds, 'e.venue_id', 3)
    const af5 = buildAssignmentFilterClause(userRole, userId, 'e.id', vf5.nextIdx)
    const partialResult = await query(
      `SELECT COUNT(*) as count FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.event_date > $1 AND e.event_date <= $2
         AND v.requires_assignment = true
         AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id) ${vf5.clause} ${af5.clause}`,
      [today, weekEndStr, ...vf5.params, ...af5.params]
    )
    const upcoming = parseInt(partialResult.rows[0]?.count || '0')
    if (upcoming > 0) {
      alerts.push({
        type: 'upcoming_unassigned',
        severity: 'info',
        title: `${upcoming} event${upcoming > 1 ? 's' : ''} this week still need assignment`,
        detail: 'Upcoming events that require staff but haven\'t been assigned yet',
        count: upcoming,
      })
    }

    return NextResponse.json({ alerts })
  } catch (err) {
    console.error('Error fetching alerts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
