import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const rowsResult = await query(
      `SELECT e.id
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE COALESCE(v.venue_type, 'sports') <> 'sports'
         AND COALESCE(e.event_type, 'event') = 'game'`
    )

    const eventIds = rowsResult.rows.map((row) => row.id)
    if (eventIds.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    await query(`UPDATE tickets SET event_id = NULL WHERE event_id = ANY($1::uuid[])`, [eventIds])
    await query(`DELETE FROM event_assignments WHERE event_id = ANY($1::uuid[])`, [eventIds])
    await query(`DELETE FROM workflow_submissions WHERE event_id = ANY($1::uuid[])`, [eventIds])
    const deletedResult = await query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [eventIds])

    return NextResponse.json({
      deleted: deletedResult.rowCount || 0,
      eventIds,
    })
  } catch (err) {
    console.error('Error cleaning up non-sports game events:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
