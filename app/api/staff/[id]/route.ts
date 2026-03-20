import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import bcrypt from 'bcryptjs'

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

    // Handle password reset separately
    if (body.password) {
      const hash = await bcrypt.hash(body.password, 10)
      updates.push(`password_hash = $${idx}`)
      values.push(hash)
      idx++
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    // Don't allow deleting yourself
    if (auth.userId === params.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Soft delete — set inactive instead of hard delete to preserve history
    await query(
      `UPDATE staff SET is_active = false WHERE id = $1`,
      [params.id]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
