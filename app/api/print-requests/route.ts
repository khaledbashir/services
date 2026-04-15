import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_STATUSES = new Set([
  'new_request',
  'awaiting_layout',
  'awaiting_approval',
  'approved',
  'in_production',
  'shipped',
  'invoiced',
])

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'new_request'
  return ALLOWED_STATUSES.has(status) ? status : 'new_request'
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const venueIdFilter = searchParams.get('venue_id')

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const vf = buildVenueFilterClause(venueIds, 'pr.venue_id', 1)

    const conditions: string[] = []
    const params: any[] = [...vf.params]

    if (vf.clause) conditions.push(vf.clause.replace(/^AND /, ''))
    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter)
      conditions.push(`pr.status = $${params.length}`)
    }
    if (venueIdFilter) {
      params.push(venueIdFilter)
      conditions.push(`pr.venue_id = $${params.length}`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `SELECT pr.id, pr.client_name, pr.job_title, pr.notes, pr.shipping_info, pr.ship_date, pr.arrival_date,
              pr.britten_cost, pr.anc_cost, pr.tracking_number, pr.status,
              TO_CHAR(pr.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(pr.updated_at, 'Mon DD, YYYY') as updated_date,
              v.name as venue_name, v.id as venue_id,
              s.full_name as assignee_name, s.id as assignee_id
       FROM print_requests pr
       LEFT JOIN venues v ON pr.venue_id = v.id
       LEFT JOIN staff s ON pr.assignee_id = s.id
       ${whereClause}
       ORDER BY COALESCE(pr.arrival_date, pr.ship_date, CURRENT_DATE + INTERVAL '365 days'), pr.created_at DESC`,
      params,
    )

    return NextResponse.json({ print_requests: result.rows })
  } catch (err) {
    console.error('Error fetching print requests:', err)
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
      client_name,
      job_title,
      notes,
      shipping_info,
      ship_date,
      arrival_date,
      britten_cost,
      anc_cost,
      tracking_number,
      assignee_id,
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
      `INSERT INTO print_requests (
        venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date,
        britten_cost, anc_cost, tracking_number, assignee_id, status, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, NOW()
      )
      RETURNING id, job_title, status`,
      [
        venue_id || null,
        client_name?.trim() || null,
        job_title.trim(),
        notes?.trim() || null,
        shipping_info?.trim() || null,
        ship_date || null,
        arrival_date || null,
        britten_cost || null,
        anc_cost || null,
        tracking_number?.trim() || null,
        assignee_id || null,
        normalizeStatus(status),
      ],
    )

    return NextResponse.json({ print_request: result.rows[0] })
  } catch (err) {
    console.error('Error creating print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
