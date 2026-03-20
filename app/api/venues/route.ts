import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      `SELECT 
        v.id,
        v.name,
        m.name as market,
        COUNT(e.id) as events_this_month
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN events e ON v.id = e.venue_id 
        AND EXTRACT(YEAR FROM e.start_time) = EXTRACT(YEAR FROM NOW())
        AND EXTRACT(MONTH FROM e.start_time) = EXTRACT(MONTH FROM NOW())
      GROUP BY v.id, m.name
      ORDER BY v.name`
    )

    return NextResponse.json({ venues: result.rows })
  } catch (err) {
    console.error('Error fetching venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
