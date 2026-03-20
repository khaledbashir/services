import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const alerts: Array<{ type: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; count?: number }> = []

    // 1. Events today with no staff assigned
    const unassignedResult = await query(
      `SELECT COUNT(*) as count FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.event_date = $1
         AND v.requires_assignment = true
         AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`,
      [today]
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
    const noCheckinResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.start_time <= $2
         AND e.workflow_status = 'pending'
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`,
      [today, twoHoursFromNow.toISOString()]
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
    const notReadyResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.start_time <= $2
         AND e.workflow_status = 'checked_in'`,
      [today, oneHourFromNow.toISOString()]
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
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const overdueResult = await query(
      `SELECT COUNT(*) as count FROM events e
       WHERE e.event_date = $1
         AND e.workflow_status != 'post_game_submitted'
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`,
      [yesterdayStr]
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
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().split('T')[0]
    const partialResult = await query(
      `SELECT COUNT(*) as count FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.event_date > $1 AND e.event_date <= $2
         AND v.requires_assignment = true
         AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`,
      [today, weekEndStr]
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
