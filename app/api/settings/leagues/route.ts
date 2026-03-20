import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(
      `SELECT id, league, estimated_hours FROM league_settings ORDER BY league`
    )
    return NextResponse.json({ leagues: result.rows })
  } catch (err) {
    console.error('Error fetching league settings:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, estimated_hours } = await request.json()

    await query(
      `UPDATE league_settings SET estimated_hours = $1, updated_at = NOW() WHERE id = $2`,
      [estimated_hours, id]
    )

    const result = await query(
      `SELECT id, league, estimated_hours FROM league_settings ORDER BY league`
    )
    return NextResponse.json({ leagues: result.rows })
  } catch (err) {
    console.error('Error updating league settings:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
