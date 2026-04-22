import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Maintenance, isTwentyBackedEnabled } from '@/lib/twenty-ops'

const EDITABLE = ['asset_id','station_id','technician_id','maintenance_type','issue','issue_summary',
  'details_to_resolve','status','reported_date','scheduled_date','completed_date',
  'escort_information','location_reported','techs_scheduled']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json()

  if (isTwentyBackedEnabled('MAINTENANCE')) {
    try {
      const patch: Record<string, unknown> = {}
      if ('issue' in body) patch.issue = body.issue
      if ('issue_summary' in body) patch.name = body.issue_summary
      if ('details_to_resolve' in body) patch.detailsToResolve = { markdown: body.details_to_resolve || '' }
      if ('scheduled_date' in body) patch.scheduledDate = body.scheduled_date
      if ('location_reported' in body) patch.locationReported = body.location_reported
      if ('escort_information' in body) patch.escortInformation = body.escort_information
      const updated = await Maintenance.update(params.id, patch)
      return NextResponse.json({ log: { id: updated.id, ...body } })
    } catch (err) {
      console.error('[maintenance PATCH twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to update maintenance log in Twenty' }, { status: 500 })
    }
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const k of EDITABLE) {
    if (k in body) { values.push(body[k]); sets.push(`${k} = $${values.length}`) }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  values.push(params.id)
  const r = await query(`UPDATE maintenance_logs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values)
  return NextResponse.json({ log: r.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('MAINTENANCE')) {
    try {
      await Maintenance.delete(params.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[maintenance DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete maintenance log in Twenty' }, { status: 500 })
    }
  }

  await query(`DELETE FROM maintenance_logs WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
