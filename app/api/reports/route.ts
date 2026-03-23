import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'
    const venueId = searchParams.get('venue_id') || ''

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

    // Build venue filter clause
    const params: any[] = [startDate, endDate]
    const venueFilter = venueId ? `AND e.venue_id = $3` : ''
    const venueFilterTickets = venueId ? `AND t.venue_id = $3` : ''
    if (venueId) params.push(venueId)
    const p1 = '$1', p2 = '$2'

    // Total events in period
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM events e WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}`,
      params
    )

    // Events with assignments (coverage)
    const coveredResult = await query(
      `SELECT COUNT(DISTINCT e.id) as covered FROM events e
       JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}`,
      params
    )

    // Workflow completion
    const workflowResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed
       FROM events e
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}
         AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`,
      params
    )

    // Labor hours
    const laborResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours, COUNT(DISTINCT ea.staff_id) as unique_staff
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}`,
      params
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
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}
       GROUP BY m.name
       ORDER BY events DESC`,
      params
    )

    // By league
    const leagueResult = await query(
      `SELECT COALESCE(e.league, 'Other') as league, COUNT(e.id) as events,
              COALESCE(SUM(ea.estimated_hours), 0) as hours
       FROM events e
       LEFT JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}
       GROUP BY e.league
       ORDER BY events DESC`,
      params
    )

    // Top staff by hours
    const topStaffResult = await query(
      `SELECT s.full_name, s.role, COUNT(ea.id) as events,
              COALESCE(SUM(ea.estimated_hours), 0) as hours,
              COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed
       FROM event_assignments ea
       JOIN staff s ON ea.staff_id = s.id
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}
       GROUP BY s.id, s.full_name, s.role
       ORDER BY hours DESC
       LIMIT 10`,
      params
    )

    // Top venues by events
    const topVenuesResult = await query(
      `SELECT v.name, m.name as market, COUNT(e.id) as events,
              COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN markets m ON v.market_id = m.id
       LEFT JOIN event_assignments ea ON e.id = ea.event_id
       WHERE e.event_date >= ${p1} AND e.event_date <= ${p2} ${venueFilter}
       GROUP BY v.id, v.name, m.name
       ORDER BY events DESC
       LIMIT 10`,
      params
    )

    const total = parseInt(totalResult.rows[0]?.total || '0')
    const covered = parseInt(coveredResult.rows[0]?.covered || '0')
    const wfTotal = parseInt(workflowResult.rows[0]?.total || '0')
    const wfCompleted = parseInt(workflowResult.rows[0]?.completed || '0')

    // SLA compliance — tickets use 't' alias
    const ticketParams: any[] = [startDate, endDate]
    if (venueId) ticketParams.push(venueId)
    const slaResult = await query(
      `SELECT
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN t.status IN ('resolved','closed') THEN 1 END) as resolved,
        COUNT(CASE WHEN t.sla_response_met = true THEN 1 END) as response_met,
        COUNT(CASE WHEN t.sla_response_met = false THEN 1 END) as response_breached,
        COUNT(CASE WHEN t.sla_resolution_met = true THEN 1 END) as resolution_met,
        COUNT(CASE WHEN t.sla_resolution_met = false THEN 1 END) as resolution_breached,
        AVG(CASE WHEN t.first_response_at IS NOT NULL THEN EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 3600 END) as avg_response_hours,
        AVG(CASE WHEN t.resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 END) as avg_resolution_hours
       FROM tickets t
       WHERE t.created_at >= ${p1} AND t.created_at <= ${p2}::date + 1 ${venueFilterTickets}`,
      ticketParams
    )

    const slaData = slaResult.rows[0]

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
        tickets: {
          total: parseInt(slaData?.total_tickets || '0'),
          resolved: parseInt(slaData?.resolved || '0'),
          slaResponseMet: parseInt(slaData?.response_met || '0'),
          slaResponseBreached: parseInt(slaData?.response_breached || '0'),
          slaResolutionMet: parseInt(slaData?.resolution_met || '0'),
          slaResolutionBreached: parseInt(slaData?.resolution_breached || '0'),
          avgResponseHours: slaData?.avg_response_hours ? Math.round(parseFloat(slaData.avg_response_hours) * 10) / 10 : null,
          avgResolutionHours: slaData?.avg_resolution_hours ? Math.round(parseFloat(slaData.avg_resolution_hours) * 10) / 10 : null,
        },
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
