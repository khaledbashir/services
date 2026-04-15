import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'in_qc',
  'client_review',
  'approved',
  'done',
])

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'request_submitted'
  return ALLOWED_STATUSES.has(status) ? status : 'request_submitted'
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const venueIdFilter = searchParams.get('venue_id')

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const vf = buildVenueFilterClause(venueIds, 'dr.venue_id', 1)

    const conditions: string[] = []
    const params: any[] = [...vf.params]

    if (vf.clause) conditions.push(vf.clause.replace(/^AND /, ''))
    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter)
      conditions.push(`dr.status = $${params.length}`)
    }
    if (venueIdFilter) {
      params.push(venueIdFilter)
      conditions.push(`dr.venue_id = $${params.length}`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Hard cap — the table now has ~20k rows after the CRM import and the
    // Kanban page blows up if we try to render everything. Default to a
    // usable page; caller can bump via ?limit=.
    const requestedLimit = Number(searchParams.get('limit')) || 200
    const limit = Math.min(Math.max(requestedLimit, 1), 500)
    params.push(limit)

    const result = await query(
      `SELECT dr.id, dr.job_title, dr.company_name, dr.tricode, dr.ftp_proof_link, dr.ftp_final_link,
              dr.final_file_name, dr.final_duration, dr.notes, dr.boards_requested, dr.sizes_requested,
              dr.status, dr.hours_estimated, dr.hours_spent, dr.due_date,
              TO_CHAR(dr.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(dr.updated_at, 'Mon DD, YYYY') as updated_date,
              v.name as venue_name, v.id as venue_id,
              d.full_name as designer_name, d.id as designer_id,
              ec.full_name as enterprise_contact_name, ec.id as enterprise_contact_id
       FROM design_requests dr
       LEFT JOIN venues v ON dr.venue_id = v.id
       LEFT JOIN staff d ON dr.designer_id = d.id
       LEFT JOIN staff ec ON dr.enterprise_contact_id = ec.id
       ${whereClause}
       ORDER BY COALESCE(dr.due_date, CURRENT_DATE + INTERVAL '365 days'), dr.created_at DESC
       LIMIT $${params.length}`,
      params,
    )

    const countResult = await query(
      `SELECT COUNT(*) FROM design_requests dr ${whereClause.replace(/\$(\d+)/g, (_, n) => `$${n}`) || ''}`,
      params.slice(0, -1),
    )

    return NextResponse.json({
      design_requests: result.rows,
      total: Number(countResult.rows[0]?.count || 0),
      limit,
    })
  } catch (err) {
    console.error('Error fetching design requests:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const {
      venue_id,
      company_name,
      job_title,
      tricode,
      ftp_proof_link,
      ftp_final_link,
      final_file_name,
      final_duration,
      notes,
      boards_requested,
      sizes_requested,
      designer_id,
      enterprise_contact_id,
      status,
      hours_estimated,
      hours_spent,
      due_date,
    } = body

    if (!job_title?.trim()) {
      return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && venue_id && !venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await query(
      `INSERT INTO design_requests (
        venue_id, company_name, job_title, tricode, ftp_proof_link, ftp_final_link,
        final_file_name, final_duration, notes, boards_requested, sizes_requested,
        designer_id, enterprise_contact_id, status, hours_estimated, hours_spent, due_date, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, NOW()
      )
      RETURNING id, job_title, status`,
      [
        venue_id || null,
        company_name?.trim() || null,
        job_title.trim(),
        tricode?.trim() || null,
        ftp_proof_link?.trim() || null,
        ftp_final_link?.trim() || null,
        final_file_name?.trim() || null,
        final_duration?.trim() || null,
        notes?.trim() || null,
        boards_requested?.trim() || null,
        sizes_requested?.trim() || null,
        designer_id || null,
        enterprise_contact_id || null,
        normalizeStatus(status),
        hours_estimated || null,
        hours_spent || 0,
        due_date || null,
      ],
    )

    return NextResponse.json({ design_request: result.rows[0] })
  } catch (err) {
    console.error('Error creating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
