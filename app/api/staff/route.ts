import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      'SELECT id, full_name, email, phone, role, title, city, profile_image, is_active FROM staff ORDER BY full_name'
    )

    return NextResponse.json({ staff: result.rows })
  } catch (err) {
    console.error('Error fetching staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { fullName, email, role, password } = await request.json()

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    const result = await query(
      `INSERT INTO staff (full_name, email, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, full_name, email, role, is_active`,
      [fullName, email, role, passwordHash]
    )

    return NextResponse.json({ staff: result.rows[0] })
  } catch (err) {
    console.error('Error creating staff:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
