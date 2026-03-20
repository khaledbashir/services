import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query(
      `SELECT id, full_name, email, phone, role, title, city, profile_image, is_active, created_at
       FROM staff WHERE id = $1`,
      [params.id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    return NextResponse.json({ staff: result.rows[0] })
  } catch (err) {
    console.error('Error fetching staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    const allowedFields = ['full_name', 'email', 'phone', 'role', 'title', 'city', 'profile_image', 'is_active']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${idx}`)
        values.push(body[field])
        idx++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE staff SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, full_name, email, phone, role, title, city, profile_image, is_active`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    return NextResponse.json({ staff: result.rows[0] })
  } catch (err) {
    console.error('Error updating staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
