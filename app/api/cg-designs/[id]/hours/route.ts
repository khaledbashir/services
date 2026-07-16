export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logCgDesignActivity } from '@/lib/cg-design-activity'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT te.id, te.hours, te.description, te.entry_date::text, te.created_at,
            te.designer_id, s.full_name as designer_name
     FROM designer_time_entries te
     LEFT JOIN staff s ON s.id = te.designer_id
     WHERE te.cg_design_request_id = $1
     ORDER BY te.entry_date DESC, te.created_at DESC`,
    [params.id],
  )
  const total = res.rows.reduce((sum: number, row: any) => sum + Number(row.hours || 0), 0)
  return NextResponse.json({ entries: res.rows, total_hours: Number(total.toFixed(2)) })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const hours = Number(body.hours)
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: 'hours must be a positive number' }, { status: 400 })
  }

  const exists = await query(`SELECT id FROM cg_design_requests WHERE id = $1`, [params.id])
  if (exists.rows.length === 0) return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })

  const designerId = typeof body.designer_id === 'string' && body.designer_id ? body.designer_id : auth.userId
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : null
  const entryDate = typeof body.entry_date === 'string' && body.entry_date ? body.entry_date : null

  const inserted = await query(
    `INSERT INTO designer_time_entries
       (cg_design_request_id, designer_id, entry_date, hours, description)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5)
     RETURNING id, hours, description, entry_date::text, created_at`,
    [params.id, designerId, entryDate, hours, description],
  )

  await logCgDesignActivity({
    cgDesignRequestId: params.id,
    eventType: 'time_logged',
    actor: auth,
    toValue: String(hours),
    detail: { hours, description, entryDate: entryDate || new Date().toISOString().slice(0, 10) },
  })

  return NextResponse.json({ entry: inserted.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const entryId = new URL(request.url).searchParams.get('entry_id')
  if (!entryId) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })
  const deleted = await query(
    `DELETE FROM designer_time_entries WHERE id = $1 AND cg_design_request_id = $2 RETURNING hours, description`,
    [entryId, params.id],
  )
  if (deleted.rows[0]) {
    await logCgDesignActivity({
      cgDesignRequestId: params.id,
      eventType: 'note',
      actor: auth,
      toValue: 'time_entry_removed',
      detail: { hours: Number(deleted.rows[0].hours || 0), description: deleted.rows[0].description || null },
    })
  }
  return NextResponse.json({ ok: true })
}
