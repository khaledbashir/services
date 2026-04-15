import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

const ALLOWED_STATUSES = new Set([
  'in_queue',
  'scheduled_to_launch',
  'content_live',
  'confirmed_with_client',
])

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'in_queue'
  return ALLOWED_STATUSES.has(status) ? status : 'in_queue'
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const venueIdFilter = searchParams.get('venue_id')

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const vf = buildVenueFilterClause(venueIds, 'cs.venue_id', 1)

    const conditions: string[] = []
    const params: any[] = [...vf.params]

    if (vf.clause) conditions.push(vf.clause.replace(/^AND /, ''))
    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter)
      conditions.push(`cs.status = $${params.length}`)
    }
    if (venueIdFilter) {
      params.push(venueIdFilter)
      conditions.push(`cs.venue_id = $${params.length}`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `SELECT cs.id, cs.company_name, cs.content_name, cs.launch_date, cs.end_date, cs.files_ready, cs.status, cs.notes,
              TO_CHAR(cs.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(cs.updated_at, 'Mon DD, YYYY') as updated_date,
              v.name as venue_name, v.id as venue_id,
              s.full_name as operator_name, s.id as operator_id
       FROM content_schedules cs
       LEFT JOIN venues v ON cs.venue_id = v.id
       LEFT JOIN staff s ON cs.operator_id = s.id
       ${whereClause}
       ORDER BY COALESCE(cs.launch_date, CURRENT_DATE + INTERVAL '365 days'), cs.created_at DESC`,
      params,
    )

    return NextResponse.json({ content_schedules: result.rows })
  } catch (err) {
    console.error('Error fetching content schedules:', err)
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
      content_name,
      launch_date,
      end_date,
      operator_id,
      files_ready,
      status,
      notes,
    } = body

    if (!content_name?.trim()) {
      return NextResponse.json({ error: 'content_name is required' }, { status: 400 })
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && venue_id && !venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await query(
      `INSERT INTO content_schedules (
        venue_id, company_name, content_name, launch_date, end_date, operator_id, files_ready, status, notes, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
      RETURNING id, content_name, status`,
      [
        venue_id || null,
        company_name?.trim() || null,
        content_name.trim(),
        launch_date || null,
        end_date || null,
        operator_id || null,
        Boolean(files_ready),
        normalizeStatus(status),
        notes?.trim() || null,
      ],
    )

    return NextResponse.json({ content_schedule: result.rows[0] })
  } catch (err) {
    console.error('Error creating content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
