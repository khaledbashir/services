export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const FIELD_WHITELIST = new Set(['designer_id', 'enterprise_contact_id'])

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : []
    const field: string = typeof body?.field === 'string' ? body.field : ''
    const assigneeId: string | null = typeof body?.assignee_id === 'string' && body.assignee_id
      ? body.assignee_id
      : null

    if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
    if (!FIELD_WHITELIST.has(field)) return NextResponse.json({ error: 'field must be designer_id or enterprise_contact_id' }, { status: 400 })

    const res = await query(
      `UPDATE design_requests
         SET ${field} = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[])
       RETURNING id`,
      [assigneeId, ids],
    )

    return NextResponse.json({ updated: res.rowCount, ids: res.rows.map((r: { id: string }) => r.id) })
  } catch (err) {
    console.error('Error in bulk-assign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
