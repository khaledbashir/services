import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    for (const key of ['name', 'venue_id', 'start_time', 'end_time', 'required_staff', 'recurrence', 'custom_days', 'is_active']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx}`)
        values.push(body[key])
        idx++
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE shift_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error updating shift template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    await query('DELETE FROM shift_templates WHERE id = $1', [params.id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting shift template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
