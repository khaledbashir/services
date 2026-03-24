import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query(
      `SELECT sv.id, sv.venue_id, v.name as venue_name, m.name as market_name, sv.created_at
       FROM staff_venues sv
       JOIN venues v ON sv.venue_id = v.id
       LEFT JOIN markets m ON v.market_id = m.id
       WHERE sv.staff_id = $1
       ORDER BY v.name`,
      [params.id]
    )
    return NextResponse.json({ linkedVenues: result.rows })
  } catch (err) {
    console.error('Error fetching staff venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { venue_id } = await request.json()
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    await query(
      `INSERT INTO staff_venues (staff_id, venue_id)
       VALUES ($1, $2)
       ON CONFLICT (staff_id, venue_id) DO NOTHING`,
      [params.id, venue_id]
    )

    // Return updated list
    const result = await query(
      `SELECT sv.id, sv.venue_id, v.name as venue_name, m.name as market_name, sv.created_at
       FROM staff_venues sv
       JOIN venues v ON sv.venue_id = v.id
       LEFT JOIN markets m ON v.market_id = m.id
       WHERE sv.staff_id = $1
       ORDER BY v.name`,
      [params.id]
    )
    return NextResponse.json({ linkedVenues: result.rows })
  } catch (err) {
    console.error('Error linking venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { venue_id } = await request.json()
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    await query(
      `DELETE FROM staff_venues WHERE staff_id = $1 AND venue_id = $2`,
      [params.id, venue_id]
    )

    // Return updated list
    const result = await query(
      `SELECT sv.id, sv.venue_id, v.name as venue_name, m.name as market_name, sv.created_at
       FROM staff_venues sv
       JOIN venues v ON sv.venue_id = v.id
       LEFT JOIN markets m ON v.market_id = m.id
       WHERE sv.staff_id = $1
       ORDER BY v.name`,
      [params.id]
    )
    return NextResponse.json({ linkedVenues: result.rows })
  } catch (err) {
    console.error('Error unlinking venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
