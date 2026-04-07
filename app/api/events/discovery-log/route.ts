import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const result = await query(
      `SELECT
         dl.id,
         dl.venue_id,
         COALESCE(v.name, 'System / Bulk Run') as venue_name,
         dl.discovered_at,
         dl.source,
         dl.events_found,
         dl.events_imported,
         dl.status,
         dl.created_at
       FROM discovery_log dl
       LEFT JOIN venues v ON v.id = dl.venue_id
       ORDER BY dl.discovered_at DESC, dl.created_at DESC
       LIMIT 100`
    )

    return NextResponse.json({ logs: result.rows })
  } catch (err) {
    console.error('Error fetching discovery log:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
