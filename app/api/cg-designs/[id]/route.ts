import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'league',
  'team_name',
  'job_title',
  'notes',
  'designer_id',
  'due_date',
  'status',
])

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'review',
  'revisions',
  'approved',
  'posted',
])

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'designer_id'].includes(key)) return value || null
  if (['league', 'team_name', 'job_title', 'notes'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'due_date') return value || null
  return value
}

async function getAccessibleRecord(request: NextRequest, id: string) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'cg.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT cg.id, cg.venue_id, cg.league, cg.team_name, cg.job_title, cg.notes, cg.designer_id, cg.due_date, cg.status,
            cg.created_at, cg.updated_at, v.name as venue_name, s.full_name as designer_name
     FROM cg_design_requests cg
     LEFT JOIN venues v ON cg.venue_id = v.id
     LEFT JOIN staff s ON cg.designer_id = s.id
     WHERE cg.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
    }
    return NextResponse.json({ cg_design_request: access.record })
  } catch (err) {
    console.error('Error fetching CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
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
      `UPDATE cg_design_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, job_title, status, updated_at`,
      values,
    )

    return NextResponse.json({ cg_design_request: result.rows[0] })
  } catch (err) {
    console.error('Error updating CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest) {
  return NextResponse.json({ error: 'Delete not supported' }, { status: 405 })
}
