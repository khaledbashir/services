export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const r = await query(
    `SELECT id, title, created_at, updated_at
     FROM ai_chats WHERE user_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [auth.userId]
  )
  return NextResponse.json({ chats: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New chat'
  const r = await query(
    `INSERT INTO ai_chats (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at`,
    [auth.userId, title]
  )
  return NextResponse.json({ chat: r.rows[0] })
}
