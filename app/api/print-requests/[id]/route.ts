import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'client_name',
  'job_title',
  'notes',
  'shipping_info',
  'ship_date',
  'arrival_date',
  'britten_cost',
  'anc_cost',
  'tracking_number',
  'assignee_id',
  'status',
])

const ALLOWED_STATUSES = new Set([
  'new_request',
  'awaiting_layout',
  'awaiting_approval',
  'approved',
  'in_production',
  'shipped',
  'invoiced',
])

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'assignee_id'].includes(key)) return value || null
  if (['client_name', 'job_title', 'notes', 'shipping_info', 'tracking_number'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'britten_cost' || key === 'anc_cost') return value === '' ? null : value
  if (key === 'ship_date' || key === 'arrival_date') return value || null
  return value
}

async function getAccessibleRecord(request: NextRequest, id: string, minRole: 'technician' | 'admin') {
  const auth = await requireRole(request, minRole)
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'pr.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT pr.id, pr.venue_id, pr.client_name, pr.job_title, pr.notes, pr.shipping_info, pr.ship_date, pr.arrival_date,
            pr.britten_cost, pr.anc_cost, pr.tracking_number, pr.assignee_id, pr.status, pr.created_at, pr.updated_at,
            v.name as venue_name, s.full_name as assignee_name
     FROM print_requests pr
     LEFT JOIN venues v ON pr.venue_id = v.id
     LEFT JOIN staff s ON pr.assignee_id = s.id
     WHERE pr.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
    }
    return NextResponse.json({ print_request: access.record })
  } catch (err) {
    console.error('Error fetching print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
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
      `UPDATE print_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, job_title, status, updated_at`,
      values,
    )

    return NextResponse.json({ print_request: result.rows[0] })
  } catch (err) {
    console.error('Error updating print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'admin')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
    }

    await query('DELETE FROM print_requests WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
