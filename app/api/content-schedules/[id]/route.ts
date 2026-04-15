import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'company_name',
  'content_name',
  'launch_date',
  'end_date',
  'operator_id',
  'files_ready',
  'status',
  'notes',
])

const ALLOWED_STATUSES = new Set([
  'in_queue',
  'scheduled_to_launch',
  'content_live',
  'confirmed_with_client',
])

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'operator_id'].includes(key)) return value || null
  if (['company_name', 'content_name', 'notes'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'files_ready') return Boolean(value)
  if (key === 'launch_date' || key === 'end_date') return value || null
  return value
}

async function getAccessibleRecord(request: NextRequest, id: string) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'cs.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT cs.id, cs.venue_id, cs.company_name, cs.content_name, cs.launch_date, cs.end_date, cs.operator_id, cs.files_ready,
            cs.status, cs.notes, cs.created_at, cs.updated_at, v.name as venue_name, s.full_name as operator_name
     FROM content_schedules cs
     LEFT JOIN venues v ON cs.venue_id = v.id
     LEFT JOIN staff s ON cs.operator_id = s.id
     WHERE cs.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })
    }
    return NextResponse.json({ content_schedule: access.record })
  } catch (err) {
    console.error('Error fetching content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })
    }

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    let index = 1

    for (const key of Object.keys(body)) {
      if (!ALLOWED_PATCH_FIELDS.has(key)) continue
      const value = normalizeValue(key, body[key])
      if (value === undefined) continue
      updates.push(`${key} = $${index++}`)
      values.push(value)
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE content_schedules
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, content_name, status, updated_at`,
      values,
    )

    return NextResponse.json({ content_schedule: result.rows[0] })
  } catch (err) {
    console.error('Error updating content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest) {
  return NextResponse.json({ error: 'Delete not supported' }, { status: 405 })
}
