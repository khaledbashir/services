import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      `SELECT 
        t.id,
        t.ticket_number,
        t.title,
        v.name as venue_name,
        t.priority,
        t.status
      FROM tickets t
      LEFT JOIN venues v ON t.venue_id = v.id
      WHERE t.status IN ('open', 'in_progress')
      ORDER BY 
        CASE 
          WHEN t.priority = 'critical' THEN 1
          WHEN t.priority = 'high' THEN 2
          WHEN t.priority = 'medium' THEN 3
          ELSE 4
        END,
        t.created_at DESC
      LIMIT 50`
    )

    return NextResponse.json({ openTickets: result.rows })
  } catch (err) {
    console.error('Error fetching open tickets:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
