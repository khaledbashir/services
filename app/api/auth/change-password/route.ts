import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    current_password?: string
    new_password?: string
  }
  const currentPassword = body.current_password || ''
  const newPassword = body.new_password || ''

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const hashRes = await query('SELECT password_hash FROM staff WHERE id = $1', [user.userId])
  if (hashRes.rows.length === 0) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }
  const valid = await bcrypt.compare(currentPassword, hashRes.rows[0].password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
  }

  const newHash = await bcrypt.hash(newPassword, 10)
  await query('UPDATE staff SET password_hash = $1 WHERE id = $2', [newHash, user.userId])

  return NextResponse.json({ ok: true })
}
