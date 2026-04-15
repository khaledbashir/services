import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    // Detach tickets first (FK constraint), then wipe assignments + events.
    await query(`UPDATE tickets SET event_id = NULL WHERE event_id IS NOT NULL`)
    await query(`DELETE FROM event_assignments WHERE event_id IN (SELECT id FROM events)`)
    const result = await query(`DELETE FROM events RETURNING id`)

    return NextResponse.json({ deleted: result.rowCount ?? 0 })
  } catch (err) {
    console.error('Error wiping events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
