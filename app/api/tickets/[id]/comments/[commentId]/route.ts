export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { jwtVerify } from 'jose'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

// Delete an internal note (Chris D, 2026-07-08): "If a mistake is made and
// posted, we are unable to edit/delete it." Soft-delete only — the row stays in
// the DB (deleted_at/deleted_by) for audit, but drops out of every read. A tech
// can delete their OWN note; admins and managers can delete any.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const c = await query(
      `SELECT id, author_id, deleted_at FROM ticket_comments WHERE id = $1 AND ticket_id = $2`,
      [params.commentId, params.id]
    )
    if (c.rows.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    if (c.rows[0].deleted_at) return NextResponse.json({ ok: true, already: true })

    const role = String(user.role || '')
    const isOwner = c.rows[0].author_id && c.rows[0].author_id === user.userId
    const isModerator = role === 'admin' || role === 'manager'
    if (!isOwner && !isModerator) {
      return NextResponse.json({ error: 'You can only delete your own notes' }, { status: 403 })
    }

    await query(
      `UPDATE ticket_comments SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [user.userId || null, params.commentId]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
