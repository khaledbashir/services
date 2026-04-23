import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

const MANAGER_ROLES = new Set(['admin', 'tech_support', 'manager'])

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const venueId = params.id
    const noteId = params.noteId

    // Only the author or a manager+ can delete. Techs can't nuke each other's notes.
    const existing = await query(
      `SELECT author_id FROM venue_notes WHERE id = $1 AND venue_id = $2`,
      [noteId, venueId]
    )
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    const isAuthor = existing.rows[0].author_id === auth.userId
    const isManager = MANAGER_ROLES.has(auth.role)
    if (!isAuthor && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await query(`DELETE FROM venue_notes WHERE id = $1`, [noteId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting venue note:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
