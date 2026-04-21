import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const EDITABLE = ['venue_id','company_name','client_name','submission_contact','date_received',
  'project_code','part_number','part_name','model_number','led_manufacturer','description',
  'quantities','repair_vendor','shipping_method','shipment_tracking','parts_details',
  'remit_to_stock','status','notes']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  const sets: string[] = []
  const values: unknown[] = []
  for (const k of EDITABLE) {
    if (k in body) { values.push(body[k]); sets.push(`${k} = $${values.length}`) }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  values.push(params.id)
  const r = await query(`UPDATE rma_trackers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values)
  return NextResponse.json({ rma: r.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth
  await query(`DELETE FROM rma_trackers WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
