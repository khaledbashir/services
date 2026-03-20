import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'

    const now = new Date()
    let startDate: string
    let endDate: string = now.toISOString().split('T')[0]

    if (period === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      startDate = d.toISOString().split('T')[0]
    } else {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      startDate = d.toISOString().split('T')[0]
    }

    // Total events in period
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM events WHERE event_date >= $1 AND event_date <= $2`,
      [startDate, endDate]
    )

    // Events with assignments (coverage)
    const coveredResult = await query(
      `SELECT COUNT(DISTINCT e.id) as covered FROM events e
       JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= $1 AND e.event_date <= $2`,
      [startDate, endDate]
    )

    // Workflow completion
    const workflowResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed
       FROM events
       WHERE event_date >= $1 AND event_date <= $2
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)`,
      [startDate, endDate]
    )

    // Labor hours
    const laborResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours, COUNT(DISTINCT ea.staff_id) as unique_staff
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= $1 AND e.event_date <= $2`,
      [startDate, endDate]
    )

    // By market
    const marketResult = await query(
      `SELECT m.name as market, COUNT(e.id) as events,
              COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered,
              COALESCE(SUM(ea.estimated_hours), 0) as hours
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN markets m ON v.market_id = m.id
       LEFT JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY m.name
       ORDER BY events DESC`,
      [startDate, endDate]
    )

    // By league
    const leagueResult = await query(
      `SELECT COALESCE(e.league, 'Other') as league, COUNT(e.id) as events,
              COALESCE(SUM(ea.estimated_hours), 0) as hours
       FROM events e
       LEFT JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY e.league
       ORDER BY events DESC`,
      [startDate, endDate]
    )

    // Top staff by hours
    const topStaffResult = await query(
      `SELECT s.full_name, s.role, COUNT(ea.id) as events,
              COALESCE(SUM(ea.estimated_hours), 0) as hours,
              COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed
       FROM event_assignments ea
       JOIN staff s ON ea.staff_id = s.id
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY s.id, s.full_name, s.role
       ORDER BY hours DESC
       LIMIT 10`,
      [startDate, endDate]
    )

    // Top venues by events
    const topVenuesResult = await query(
      `SELECT v.name, m.name as market, COUNT(e.id) as events,
              COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN markets m ON v.market_id = m.id
       LEFT JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY v.id, v.name, m.name
       ORDER BY events DESC
       LIMIT 10`,
      [startDate, endDate]
    )

    const total = parseInt(totalResult.rows[0]?.total || '0')
    const covered = parseInt(coveredResult.rows[0]?.covered || '0')
    const wfTotal = parseInt(workflowResult.rows[0]?.total || '0')
    const wfCompleted = parseInt(workflowResult.rows[0]?.completed || '0')

    return NextResponse.json({
      period,
      startDate,
      endDate,
      summary: {
        totalEvents: total,
        coveredEvents: covered,
        coverageRate: total > 0 ? Math.round((covered / total) * 100) : 0,
        workflowCompletionRate: wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 0,
        totalLaborHours: parseFloat(laborResult.rows[0]?.total_hours || '0'),
        uniqueStaff: parseInt(laborResult.rows[0]?.unique_staff || '0'),
      },
      byMarket: marketResult.rows,
      byLeague: leagueResult.rows,
      topStaff: topStaffResult.rows,
      topVenues: topVenuesResult.rows,
    })
  } catch (err) {
    console.error('Error fetching report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
