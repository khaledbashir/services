import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import { renameProjectSchedulePhase } from '@/lib/project-schedule'

/**
 * PATCH /api/project-schedule/[id]/phases
 *
 * Body: { from: string, to: string }
 *
 * Renames a schedule section (phase) by re-stamping every task in it —
 * sections are derived from task phases, so this is how the purple group
 * headers get edited.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const from = String(body.from ?? '').replace(/\s+/g, ' ').trim()
    const to = String(body.to ?? '').replace(/\s+/g, ' ').trim()
    if (!from || !to) {
      return NextResponse.json({ error: 'Both the current and new section names are required.' }, { status: 400 })
    }
    if (from === to) {
      return NextResponse.json({ data: { moved: 0 } })
    }

    const moved = await renameProjectSchedulePhase(params.id, from, to, auth.email || auth.fullName)
    if (moved === 0) {
      return NextResponse.json({ error: 'No tasks found in that section.' }, { status: 404 })
    }
    return NextResponse.json({ data: { moved } })
  } catch (err) {
    console.error('Error renaming project schedule phase:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
