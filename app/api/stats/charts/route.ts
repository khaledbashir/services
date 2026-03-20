import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
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

    const workflowResult = await query(
      `SELECT 
        COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed,
        COUNT(CASE WHEN workflow_status IN ('checked_in','game_ready') THEN 1 END) as in_progress,
        COUNT(CASE WHEN workflow_status = 'pending' THEN 1 END) as pending
      FROM events
      WHERE event_date >= $1 AND event_date <= CURRENT_DATE`,
      [sevenDaysAgoStr]
    )

    const marketResult = await query(
      `SELECT 
        COALESCE(m.name, 'Unknown') as market,
        COUNT(*) as count
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN markets m ON v.market_id = m.id
      WHERE e.event_date >= CURRENT_DATE AND e.event_date <= $1
      GROUP BY m.name
      ORDER BY count DESC`,
      [nextSevenStr]
    )

    const leagueResult = await query(
      `SELECT COALESCE(league, 'Other') as league, COUNT(*) as count
      FROM events
      WHERE event_date >= CURRENT_DATE AND event_date <= $1
      GROUP BY league ORDER BY count DESC`,
      [nextThirtyStr]
    )

    return NextResponse.json({
      workflow: {
        completed: parseInt(workflowResult.rows[0]?.completed || '0'),
        in_progress: parseInt(workflowResult.rows[0]?.in_progress || '0'),
        pending: parseInt(workflowResult.rows[0]?.pending || '0'),
      },
      eventsByMarket: marketResult.rows.map(r => ({ market: r.market, count: parseInt(r.count) })),
      eventsByLeague: leagueResult.rows.map(r => ({ league: r.league, count: parseInt(r.count) })),
    })
  } catch (err) {
    console.error('Error fetching chart data:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
