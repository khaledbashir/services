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

    const result = await query(
      `DELETE FROM cg_design_comments
       WHERE id = $1 AND cg_design_request_id = $2 AND ($3 OR author_id = $4)
       RETURNING id`,
      [params.commentId, params.id, auth.role === 'admin', auth.userId],
    )
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Comment not found or not yours to delete' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting CG comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
