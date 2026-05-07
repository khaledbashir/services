export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const chat = await query(
    `SELECT id, title, created_at, updated_at FROM ai_chats WHERE id = $1 AND user_id = $2`,
    [params.id, auth.userId]
  )
  if (chat.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const msgs = await query(
    `SELECT id, role, content, tool_calls, tool_call_id, tool_name, created_at
     FROM ai_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [params.id]
  )
  return NextResponse.json({ chat: chat.rows[0], messages: msgs.rows })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  if (typeof body.title === 'string') {
    await query(
      `UPDATE ai_chats SET title = $1 WHERE id = $2 AND user_id = $3`,
      [body.title.trim().slice(0, 200) || 'New chat', params.id, auth.userId]
    )
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  await query(`DELETE FROM ai_chats WHERE id = $1 AND user_id = $2`, [params.id, auth.userId])
  return NextResponse.json({ ok: true })
}
