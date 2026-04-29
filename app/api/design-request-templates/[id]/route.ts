import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const ALLOWED_FIELDS = new Set([
  'name',
  'description',
  'job_title',
  'company_name',
  'tricode',
  'notes',
  'boards_requested',
  'sizes_requested',
  'venue_id',
  'designer_id',
  'enterprise_contact_id',
  'hours_estimated',
  'is_rando',
])

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await query(
      `SELECT t.id, t.name, t.description, t.job_title, t.company_name, t.tricode,
              t.notes, t.boards_requested, t.sizes_requested,
              t.hours_estimated, t.is_rando,
              t.venue_id, v.name as venue_name,
              t.designer_id, d.full_name as designer_name,
              t.enterprise_contact_id, ec.full_name as enterprise_contact_name,
              t.created_at, t.updated_at
       FROM design_request_templates t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN staff d ON t.designer_id = d.id
       LEFT JOIN staff ec ON t.enterprise_contact_id = ec.id
       WHERE t.id = $1`,
      [params.id],
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error fetching template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    let i = 1

    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue
      let value = body[key]
      if (typeof value === 'string') value = value.trim() || null
      if (key === 'is_rando') value = !!value
      if (key === 'hours_estimated') value = value === '' || value == null ? null : Number(value)
      if (key === 'name' && (!value || typeof value !== 'string')) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      updates.push(`${key} = $${i++}`)
      values.push(value)
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE design_request_templates
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING id, name`,
      values,
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error updating template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    await query('DELETE FROM design_request_templates WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
