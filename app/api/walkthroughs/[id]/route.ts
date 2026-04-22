import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Walkthroughs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

const EDITABLE = ['technician_id','log_date','log_time','locations_visited','issues_found',
  'result','in_person','technician_name','three_letter_code','notes']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const body = await request.json()

  if (isTwentyBackedEnabled('WALKTHROUGHS')) {
    try {
      const patch: Record<string, unknown> = {}
      if ('log_date' in body) patch.logDate = body.log_date
      if ('log_time' in body) patch.logTime = body.log_time
      if ('result' in body) patch.result = body.result
      if ('notes' in body) patch.notes = { markdown: body.notes || '' }
      const updated = await Walkthroughs.update(params.id, patch)
      return NextResponse.json({ walkthrough: { id: updated.id, ...body } })
    } catch (err) {
      console.error('[walkthroughs PATCH twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to update walkthrough in Twenty' }, { status: 500 })
    }
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const k of EDITABLE) {
    if (k in body) { values.push(body[k]); sets.push(`${k} = $${values.length}`) }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  values.push(params.id)
  const r = await query(`UPDATE walkthrough_logs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values)
  return NextResponse.json({ walkthrough: r.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('WALKTHROUGHS')) {
    try {
      await Walkthroughs.delete(params.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[walkthroughs DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete walkthrough in Twenty' }, { status: 500 })
    }
  }

  await query(`DELETE FROM walkthrough_logs WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
