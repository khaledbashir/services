import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'company_name',
  'job_title',
  'tricode',
  'ftp_proof_link',
  'ftp_final_link',
  'final_file_name',
  'final_duration',
  'notes',
  'boards_requested',
  'sizes_requested',
  'designer_id',
  'enterprise_contact_id',
  'status',
  'hours_estimated',
  'hours_spent',
  'due_date',
])

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'in_qc',
  'client_review',
  'approved',
  'done',
])

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'designer_id', 'enterprise_contact_id'].includes(key)) return value || null
  if (['company_name', 'job_title', 'tricode', 'ftp_proof_link', 'ftp_final_link', 'final_file_name', 'final_duration', 'notes', 'boards_requested', 'sizes_requested'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'hours_estimated' || key === 'hours_spent') return value === '' ? null : value
  if (key === 'due_date') return value || null
  return value
}

function getBudgetThresholdState(hoursSpent: number | null | undefined, hoursEstimated: number | null | undefined) {
  const spent = Number(hoursSpent || 0)
  const estimated = Number(hoursEstimated || 0)
  if (!estimated || estimated <= 0) return false
  return spent >= estimated * 0.75
}

async function getAccessibleRecord(request: NextRequest, id: string, minRole: 'technician' | 'admin') {
  const auth = await requireRole(request, minRole)
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'dr.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT dr.id, dr.venue_id, dr.job_title, dr.company_name, dr.tricode,
            dr.ftp_proof_link, dr.ftp_final_link, dr.final_file_name, dr.final_duration,
            dr.notes, dr.boards_requested, dr.sizes_requested, dr.designer_id,
            dr.enterprise_contact_id, dr.status, dr.hours_estimated, dr.hours_spent,
            dr.due_date, dr.created_at, dr.updated_at,
            v.name as venue_name,
            d.full_name as designer_name,
            ec.full_name as enterprise_contact_name
     FROM design_requests dr
     LEFT JOIN venues v ON dr.venue_id = v.id
     LEFT JOIN staff d ON dr.designer_id = d.id
     LEFT JOIN staff ec ON dr.enterprise_contact_id = ec.id
     WHERE dr.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
    return NextResponse.json({ design_request: access.record })
  } catch (err) {
    console.error('Error fetching design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
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

    if (body.status === 'client_review' && access.record.status !== 'client_review') {
      // TODO(ahmad): hook up client-review email notification
    }

    const previousThresholdState = getBudgetThresholdState(access.record.hours_spent, access.record.hours_estimated)
    const nextHoursSpent = body.hours_spent !== undefined ? normalizeValue('hours_spent', body.hours_spent) : access.record.hours_spent
    const nextHoursEstimated = body.hours_estimated !== undefined ? normalizeValue('hours_estimated', body.hours_estimated) : access.record.hours_estimated
    const nextThresholdState = getBudgetThresholdState(nextHoursSpent, nextHoursEstimated)

    if (!previousThresholdState && nextThresholdState) {
      // TODO(ahmad): fire 75%-of-budget Slack alert
    }

    values.push(params.id)
    const result = await query(
      `UPDATE design_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, job_title, status, ftp_proof_link, updated_at`,
      values,
    )

    return NextResponse.json({ design_request: result.rows[0] })
  } catch (err) {
    console.error('Error updating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await getAccessibleRecord(request, params.id, 'admin')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }

    await query('DELETE FROM design_requests WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
