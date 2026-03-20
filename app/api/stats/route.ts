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

    return NextResponse.json({
      todaysEvents: parseInt(todaysEventsResult.rows[0]?.count || '0'),
      assignedStaff: parseInt(assignedStaffResult.rows[0]?.count || '0'),
      openTickets: parseInt(openTicketsResult.rows[0]?.count || '0'),
      pendingWorkflows: parseInt(pendingWorkflowsResult.rows[0]?.count || '0'),
    })
  } catch (err) {
    console.error('Error fetching stats:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
