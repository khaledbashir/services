import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const EDITABLE = ['part_number','part_name','manufacturer','model_name','description',
  'unit_cost','quantity_on_hand','reorder_threshold','notes']

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
  const r = await query(`UPDATE parts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values)
  return NextResponse.json({ part: r.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth
  await query(`DELETE FROM parts WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
