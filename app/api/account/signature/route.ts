export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { query } from '@/lib/db'

// GET /api/account/signature — the current user's saved email signature.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await query('SELECT email_signature FROM staff WHERE id = $1', [user.userId])
  return NextResponse.json({ signature: res.rows[0]?.email_signature ?? '' })
}

// PUT /api/account/signature — save the current user's email signature.
export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const raw = typeof body?.signature === 'string' ? body.signature : ''
  // Keep it sane: trim, cap length. Stored as plain text; rendered safely
  // (newlines → <br>) when appended to outbound email.
  const signature = raw.trim().slice(0, 2000)
  await query('UPDATE staff SET email_signature = $1 WHERE id = $2', [signature || null, user.userId])
  return NextResponse.json({ ok: true, signature })
}
