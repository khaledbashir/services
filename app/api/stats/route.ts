import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const todaysEventsResult = await query(
      `SELECT COUNT(*) as count FROM events WHERE event_date = $1`,
      [today]
    )

    const assignedStaffResult = await query(
      `SELECT COUNT(DISTINCT staff_id) as count FROM event_assignments 
       WHERE event_id IN (SELECT id FROM events WHERE event_date = $1)`,
      [today]
    )

    const openTicketsResult = await query(
      `SELECT COUNT(*) as count FROM tickets WHERE status IN ('open', 'in_progress')`
    )

    const pendingWorkflowsResult = await query(
      `SELECT COUNT(*) as count FROM events
       WHERE event_date = $1 AND workflow_status = 'pending'`,
      [today]
    )

    // Estimated labor hours this week
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const laborHoursResult = await query(
      `SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       WHERE e.event_date >= $1 AND e.event_date < $2`,
      [today, weekEndStr]
    )

    // Labor hours by staff this week
    const laborByStaffResult = await query(
      `SELECT s.full_name, SUM(ea.estimated_hours) as total_hours, COUNT(ea.id) as event_count
       FROM event_assignments ea
       JOIN events e ON ea.event_id = e.id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date >= $1 AND e.event_date < $2
       GROUP BY s.id, s.full_name
       ORDER BY total_hours DESC
       LIMIT 10`,
      [today, weekEndStr]
    )

    return NextResponse.json({
      todaysEvents: parseInt(todaysEventsResult.rows[0]?.count || '0'),
      assignedStaff: parseInt(assignedStaffResult.rows[0]?.count || '0'),
      openTickets: parseInt(openTicketsResult.rows[0]?.count || '0'),
      pendingWorkflows: parseInt(pendingWorkflowsResult.rows[0]?.count || '0'),
      estimatedLaborHours: parseFloat(laborHoursResult.rows[0]?.total_hours || '0'),
      laborByStaff: laborByStaffResult.rows,
    })
  } catch (err) {
    console.error('Error fetching stats:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
