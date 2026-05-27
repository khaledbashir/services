export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const existing = await query(
      `SELECT author_id FROM print_request_comments WHERE id = $1 AND print_request_id = $2 LIMIT 1`,
      [params.commentId, params.id],
    )
    if (!existing.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const isAuthor = existing.rows[0].author_id === auth.userId
    const isAdmin = auth.role === 'admin' || auth.role === 'manager'
    if (!isAuthor && !isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    await query(`DELETE FROM print_request_comments WHERE id = $1`, [params.commentId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting print-request comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
