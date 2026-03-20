import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query(
      `SELECT id, display_name, manufacturer, model, pixel_pitch, width_ft, height_ft,
              brightness_nits, environment, location_zone, install_date, is_active
       FROM venue_screens
       WHERE venue_id = $1
       ORDER BY display_name`,
      [params.id]
    )

    return NextResponse.json({ screens: result.rows })
  } catch (err) {
    console.error('Error fetching venue screens:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
