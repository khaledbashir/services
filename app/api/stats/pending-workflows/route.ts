import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const result = await query(
      `SELECT 
        e.id,
        e.summary as event_name,
        v.name as venue_name,
        e.start_time
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.event_date = $1 AND e.workflow_status = 'pending'
      ORDER BY e.start_time`,
      [today]
    )

    // Add workflow URLs
    const pendingWorkflows = result.rows.map((row) => ({
      ...row,
      workflow_url: `/workflow/${row.id}`,
    }))

    return NextResponse.json({ pendingWorkflows })
  } catch (err) {
    console.error('Error fetching pending workflows:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
