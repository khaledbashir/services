export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const result = await query(
    `SELECT id, event_type, actor_name, actor_email, from_value, to_value, detail, created_at
       FROM cg_design_activity
      WHERE cg_design_request_id = $1
      ORDER BY created_at DESC, id DESC`,
    [params.id],
  )
  return NextResponse.json({
    activity: result.rows.map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      fromValue: row.from_value,
      toValue: row.to_value,
      detail: row.detail || null,
      createdAt: row.created_at,
    })),
  })
}
