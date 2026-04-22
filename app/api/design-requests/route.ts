import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { Designs, isTwentyBackedEnabled, type TwentyDesignRequest } from '@/lib/twenty-ops'

function reshapeDesign(d: TwentyDesignRequest) {
  return {
    id: d.id,
    job_title: d.name,
    company_name: d.designClient?.name || null,
    tricode: null,
    ftp_proof_link: d.proofLink,
    ftp_final_link: null,
    final_file_name: d.localFilePath,
    final_duration: null,
    notes: d.aiPrompt,
    boards_requested: d.boardSection,
    sizes_requested: null,
    status: d.status || 'request_submitted',
    hours_estimated: null,
    hours_spent: null,
    due_date: null,
    created_at: d.createdAt,
    created_date: new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    updated_date: new Date(d.updatedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    venue_name: null,
    venue_id: null,
    designer_name: d.designAssignee ? `${d.designAssignee.name.firstName} ${d.designAssignee.name.lastName}`.trim() : null,
    designer_id: d.designAssigneeId,
    enterprise_contact_name: null,
    enterprise_contact_id: null,
  }
}

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

    if (isTwentyBackedEnabled('DESIGNS')) {
      const { searchParams } = new URL(request.url)
      const statusFilter = searchParams.get('status')
      const requestedLimit = Number(searchParams.get('limit')) || 200
      const limit = Math.min(Math.max(requestedLimit, 1), 500)
      const filters: string[] = []
      if (statusFilter && statusFilter !== 'all') filters.push(`status[eq]:"${statusFilter}"`)
      const items: any[] = []
      let cursor: string | null = null
      while (items.length < limit) {
        const page = await Designs.list({
          limit: Math.min(60, limit - items.length),
          startingAfter: cursor || undefined,
          filter: filters.length ? filters.join(',') : undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const d of page.items) items.push(reshapeDesign(d))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ design_requests: items, total: items.length, limit })
    }

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

    // Sort: newest (default) puts fresh records at the top so they land at
    // the top of Submitted when someone creates one — this is what users
    // expect when "I just made that, where is it?".
    const sortKey = (searchParams.get('sort') || 'newest').toLowerCase()
    const orderBy = {
      newest:   'dr.created_at DESC',
      oldest:   'dr.created_at ASC',
      updated:  'dr.updated_at DESC',
      due_asc:  `COALESCE(dr.due_date, DATE '9999-12-31') ASC, dr.created_at DESC`,
      due_desc: `COALESCE(dr.due_date, DATE '0001-01-01') DESC, dr.created_at DESC`,
      title:    'LOWER(dr.job_title) ASC',
    }[sortKey] || 'dr.created_at DESC'

    params.push(limit)

    const result = await query(
      `SELECT dr.id, dr.job_title, dr.company_name, dr.tricode, dr.ftp_proof_link, dr.ftp_final_link,
              dr.final_file_name, dr.final_duration, dr.notes, dr.boards_requested, dr.sizes_requested,
              dr.status, dr.hours_estimated, dr.hours_spent, dr.due_date,
              dr.created_at,
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
       ORDER BY ${orderBy}
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

    if (isTwentyBackedEnabled('DESIGNS')) {
      try {
        const created = await Designs.create({
          name: job_title.trim(),
          aiPrompt: notes?.trim() || null,
          boardSection: boards_requested?.trim() || null,
          proofLink: ftp_proof_link?.trim() || null,
          localFilePath: final_file_name?.trim() || null,
          status: normalizeStatus(status),
        })
        return NextResponse.json({ design_request: { id: created.id, job_title: created.name, status: created.status } })
      } catch (err) {
        console.error('[design-requests POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create design request in Twenty' }, { status: 500 })
      }
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
