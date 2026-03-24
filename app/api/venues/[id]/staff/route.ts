import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query(
      `SELECT sv.id, sv.staff_id, s.full_name, s.role, s.email, sv.created_at
       FROM staff_venues sv
       JOIN staff s ON sv.staff_id = s.id
       WHERE sv.venue_id = $1 AND s.is_active = true
       ORDER BY s.full_name`,
      [params.id]
    )
    return NextResponse.json({ linkedStaff: result.rows })
  } catch (err) {
    console.error('Error fetching venue staff:', err)
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

    const { staff_id } = await request.json()
    if (!staff_id) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
    }

    await query(
      `INSERT INTO staff_venues (staff_id, venue_id)
       VALUES ($1, $2)
       ON CONFLICT (staff_id, venue_id) DO NOTHING`,
      [staff_id, params.id]
    )

    const result = await query(
      `SELECT sv.id, sv.staff_id, s.full_name, s.role, s.email, sv.created_at
       FROM staff_venues sv
       JOIN staff s ON sv.staff_id = s.id
       WHERE sv.venue_id = $1 AND s.is_active = true
       ORDER BY s.full_name`,
      [params.id]
    )
    return NextResponse.json({ linkedStaff: result.rows })
  } catch (err) {
    console.error('Error linking staff:', err)
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

    const { staff_id } = await request.json()
    if (!staff_id) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
    }

    await query(
      `DELETE FROM staff_venues WHERE staff_id = $1 AND venue_id = $2`,
      [staff_id, params.id]
    )

    const result = await query(
      `SELECT sv.id, sv.staff_id, s.full_name, s.role, s.email, sv.created_at
       FROM staff_venues sv
       JOIN staff s ON sv.staff_id = s.id
       WHERE sv.venue_id = $1 AND s.is_active = true
       ORDER BY s.full_name`,
      [params.id]
    )
    return NextResponse.json({ linkedStaff: result.rows })
  } catch (err) {
    console.error('Error unlinking staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
