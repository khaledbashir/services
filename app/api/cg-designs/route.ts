import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'review',
  'revisions',
  'approved',
  'posted',
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
    const vf = buildVenueFilterClause(venueIds, 'cg.venue_id', 1)

    const conditions: string[] = []
    const params: any[] = [...vf.params]

    if (vf.clause) conditions.push(vf.clause.replace(/^AND /, ''))
    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter)
      conditions.push(`cg.status = $${params.length}`)
    }
    if (venueIdFilter) {
      params.push(venueIdFilter)
      conditions.push(`cg.venue_id = $${params.length}`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `SELECT cg.id, cg.league, cg.team_name, cg.job_title, cg.notes, cg.due_date, cg.status,
              TO_CHAR(cg.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(cg.updated_at, 'Mon DD, YYYY') as updated_date,
              v.name as venue_name, v.id as venue_id,
              s.full_name as designer_name, s.id as designer_id
       FROM cg_design_requests cg
       LEFT JOIN venues v ON cg.venue_id = v.id
       LEFT JOIN staff s ON cg.designer_id = s.id
       ${whereClause}
       ORDER BY COALESCE(cg.due_date, CURRENT_DATE + INTERVAL '365 days'), cg.created_at DESC`,
      params,
    )

    return NextResponse.json({ cg_design_requests: result.rows })
  } catch (err) {
    console.error('Error fetching CG design requests:', err)
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
      league,
      team_name,
      job_title,
      notes,
      designer_id,
      due_date,
      status,
    } = body

    if (!job_title?.trim()) {
      return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && venue_id && !venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await query(
      `INSERT INTO cg_design_requests (
        venue_id, league, team_name, job_title, notes, designer_id, due_date, status, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      RETURNING id, job_title, status`,
      [
        venue_id || null,
        league?.trim() || null,
        team_name?.trim() || null,
        job_title.trim(),
        notes?.trim() || null,
        designer_id || null,
        due_date || null,
        normalizeStatus(status),
      ],
    )

    return NextResponse.json({ cg_design_request: result.rows[0] })
  } catch (err) {
    console.error('Error creating CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
