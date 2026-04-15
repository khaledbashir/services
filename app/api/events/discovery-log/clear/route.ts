import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const result = await query(`DELETE FROM discovery_log RETURNING id`)
    return NextResponse.json({ deleted: result.rowCount ?? 0 })
  } catch (err) {
    console.error('Error clearing discovery log:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
