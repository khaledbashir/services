import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause, buildAssignmentFilterClause } from '@/lib/venue-filter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    const userRole = user?.role || 'admin'
    const userId = user?.userId || ''

    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
    const nextSeven = new Date(today)
    nextSeven.setDate(nextSeven.getDate() + 7)
    const nextSevenStr = nextSeven.toISOString().split('T')[0]
    const nextThirty = new Date(today)
    nextThirty.setDate(nextThirty.getDate() + 30)
    const nextThirtyStr = nextThirty.toISOString().split('T')[0]

    const vf1 = buildVenueFilterClause(venueIds, 'venue_id', 2)
    const af1 = buildAssignmentFilterClause(userRole, userId, 'id', vf1.nextIdx)
    const workflowResult = await query(
      `SELECT
        COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed,
        COUNT(CASE WHEN workflow_status IN ('checked_in','game_ready') THEN 1 END) as in_progress,
        COUNT(CASE WHEN workflow_status = 'pending' THEN 1 END) as pending
      FROM events
      WHERE event_date >= $1 AND event_date <= CURRENT_DATE ${vf1.clause} ${af1.clause}`,
      [sevenDaysAgoStr, ...vf1.params, ...af1.params]
    )

    const vf2 = buildVenueFilterClause(venueIds, 'e.venue_id', 2)
    const af2 = buildAssignmentFilterClause(userRole, userId, 'e.id', vf2.nextIdx)
    const marketResult = await query(
      `SELECT
        COALESCE(m.name, 'Unknown') as market,
        COUNT(*) as count
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN markets m ON v.market_id = m.id
      WHERE e.event_date >= CURRENT_DATE AND e.event_date <= $1 ${vf2.clause} ${af2.clause}
      GROUP BY m.name
      ORDER BY count DESC`,
      [nextSevenStr, ...vf2.params, ...af2.params]
    )

    const vf3 = buildVenueFilterClause(venueIds, 'venue_id', 2)
    const af3 = buildAssignmentFilterClause(userRole, userId, 'id', vf3.nextIdx)
    const leagueResult = await query(
      `SELECT COALESCE(league, 'Other') as league, COUNT(*) as count
      FROM events
      WHERE event_date >= CURRENT_DATE AND event_date <= $1 ${vf3.clause} ${af3.clause}
      GROUP BY league ORDER BY count DESC`,
      [nextThirtyStr, ...vf3.params, ...af3.params]
    )

    return NextResponse.json({
      workflow: {
        completed: parseInt(workflowResult.rows[0]?.completed || '0'),
        in_progress: parseInt(workflowResult.rows[0]?.in_progress || '0'),
        pending: parseInt(workflowResult.rows[0]?.pending || '0'),
      },
      eventsByMarket: marketResult.rows.map((r: any) => ({ market: r.market, count: parseInt(r.count) })),
      eventsByLeague: leagueResult.rows.map((r: any) => ({ league: r.league, count: parseInt(r.count) })),
    })
  } catch (err) {
    console.error('Error fetching chart data:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
