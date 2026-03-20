import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const staffId = params.id
    const today = new Date().toISOString().split('T')[0]
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().split('T')[0]
    const monthEnd = new Date()
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    const monthEndStr = monthEnd.toISOString().split('T')[0]

    // Staff info
    const staffResult = await query(
      `SELECT id, full_name, email, phone, role, title, city, profile_image, is_active, created_at
       FROM staff WHERE id = $1`,
      [staffId]
    )

    if (staffResult.rows.length === 0) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    // Upcoming assigned events (next 30 days)
    const eventsResult = await query(
      `SELECT
        e.id, e.summary, e.league,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
        v.name as venue_name,
        m.name as market_name,
        e.workflow_status,
        ea.estimated_hours
      FROM event_assignments ea
      JOIN events e ON ea.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN markets m ON v.market_id = m.id
      WHERE ea.staff_id = $1 AND e.event_date >= $2
      ORDER BY e.event_date, e.start_time
      LIMIT 50`,
      [staffId, today]
    )

    // Hours this week
    const weekHoursResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as hours, COUNT(*) as events
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE ea.staff_id = $1 AND e.event_date >= $2 AND e.event_date < $3`,
      [staffId, today, weekEndStr]
    )

    // Hours this month
    const monthHoursResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as hours, COUNT(*) as events
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE ea.staff_id = $1 AND e.event_date >= $2 AND e.event_date < $3`,
      [staffId, today, monthEndStr]
    )

    // Total historical stats
    const totalResult = await query(
      `SELECT COUNT(*) as total_events,
              COALESCE(SUM(ea.estimated_hours), 0) as total_hours
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE ea.staff_id = $1`,
      [staffId]
    )

    // Workflow completion rate
    const workflowResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed,
        COUNT(CASE WHEN e.workflow_status = 'checked_in' THEN 1 END) as checked_in,
        COUNT(CASE WHEN e.workflow_status = 'game_ready' THEN 1 END) as game_ready,
        COUNT(CASE WHEN e.workflow_status = 'pending' THEN 1 END) as pending
      FROM event_assignments ea
      JOIN events e ON ea.event_id = e.id
      WHERE ea.staff_id = $1 AND e.event_date < $2`,
      [staffId, today]
    )

    // Markets they cover (from assigned events)
    const marketsResult = await query(
      `SELECT DISTINCT m.name as market, COUNT(DISTINCT e.id) as event_count
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       JOIN venues v ON e.venue_id = v.id
       JOIN markets m ON v.market_id = m.id
       WHERE ea.staff_id = $1
       GROUP BY m.name
       ORDER BY event_count DESC`,
      [staffId]
    )

    // Venues they work at
    const venuesResult = await query(
      `SELECT DISTINCT v.id, v.name, COUNT(DISTINCT e.id) as event_count
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       JOIN venues v ON e.venue_id = v.id
       WHERE ea.staff_id = $1
       GROUP BY v.id, v.name
       ORDER BY event_count DESC
       LIMIT 10`,
      [staffId]
    )

    // Recent workflow submissions
    const recentActivity = await query(
      `SELECT ws.type, ws.submitted_at, e.summary as event_name, v.name as venue_name
       FROM workflow_submissions ws
       JOIN events e ON ws.event_id = e.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE ws.staff_id = $1
       ORDER BY ws.submitted_at DESC
       LIMIT 10`,
      [staffId]
    )

    const weekStats = weekHoursResult.rows[0]
    const monthStats = monthHoursResult.rows[0]
    const totals = totalResult.rows[0]
    const workflow = workflowResult.rows[0]
    const completionRate = workflow.total > 0
      ? Math.round((Number(workflow.completed) / Number(workflow.total)) * 100)
      : 0

    return NextResponse.json({
      staff: staffResult.rows[0],
      upcomingEvents: eventsResult.rows,
      stats: {
        weekHours: parseFloat(weekStats.hours),
        weekEvents: parseInt(weekStats.events),
        monthHours: parseFloat(monthStats.hours),
        monthEvents: parseInt(monthStats.events),
        totalEvents: parseInt(totals.total_events),
        totalHours: parseFloat(totals.total_hours),
        completionRate,
        workflow: {
          completed: parseInt(workflow.completed),
          checked_in: parseInt(workflow.checked_in),
          game_ready: parseInt(workflow.game_ready),
          pending: parseInt(workflow.pending),
        },
      },
      markets: marketsResult.rows,
      venues: venuesResult.rows,
      recentActivity: recentActivity.rows,
    })
  } catch (err) {
    console.error('Error fetching staff stats:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
