import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'

    let dateFilter: string
    if (period === 'today') {
      dateFilter = `AND e.event_date = CURRENT_DATE`
    } else if (period === 'week') {
      dateFilter = `AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL '7 days'`
    } else {
      dateFilter = `AND e.event_date >= DATE_TRUNC('month', CURRENT_DATE) AND e.event_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`
    }

    const result = await query(
      `SELECT
        v.id,
        v.name,
        m.name as market,
        COUNT(e.id) as event_count,
        COUNT(CASE WHEN ea.event_id IS NOT NULL THEN 1 END) as assigned_count
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN events e ON v.id = e.venue_id ${dateFilter}
      LEFT JOIN (SELECT DISTINCT event_id FROM event_assignments) ea ON e.id = ea.event_id
      GROUP BY v.id, v.name, m.name
      ORDER BY v.name`
    )

    return NextResponse.json({ venues: result.rows })
  } catch (err) {
    console.error('Error fetching venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
