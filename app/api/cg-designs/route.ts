export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { CgDesigns, isTwentyBackedEnabled, type TwentyCgDesignRequest } from '@/lib/twenty-ops'
import { normalizeVenueTriCode, resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'

// Map Twenty's STATUS_* enum values onto the kanban lane keys the UI renders.
// Without this every record ends up lumped into 'request_submitted' (or a lane
// it doesn't display at all) and the Kanban comes up empty.
function mapTwentyStatus(raw: string | null | undefined): string {
  if (!raw) return 'request_submitted'
  const stripped = raw.toString().replace(/^STATUS_/i, '').toLowerCase()
  const map: Record<string, string> = {
    submitted: 'request_submitted',
    request_submitted: 'request_submitted',
    queued: 'in_queue',
    in_queue: 'in_queue',
    in_progress: 'in_progress',
    review: 'review',
    in_review: 'review',
    client_review: 'review',
    revisions: 'revisions',
    in_revisions: 'revisions',
    approved: 'approved',
    posted: 'posted',
    done: 'posted',
    complete: 'posted',
    completed: 'posted',
    request_closed: 'posted',
    closed: 'posted',
  }
  return map[stripped] || stripped || 'request_submitted'
}

function reshapeCgDesign(c: TwentyCgDesignRequest) {
  const raw = c as any
  return {
    id: c.id,
    league: raw.sport || null,
    team_name: raw.teamName || null,
    job_title: raw.name || raw.clientTriCode || raw.teamName || '(untitled)',
    notes: typeof raw.notes === 'object' ? (raw.notes?.markdown || raw.notes?.blocknote || null) : (raw.notes || null),
    due_date: raw.dueDate || null,
    status: mapTwentyStatus(raw.status),
    created_date: new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    updated_date: new Date(c.updatedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    venue_name: raw.cgClient?.name || null,
    venue_id: null,
    tricode: raw.clientTriCode || null,
    designer_name: raw.cgDesigner ? `${raw.cgDesigner.name.firstName} ${raw.cgDesigner.name.lastName}`.trim() : null,
    designer_id: raw.cgDesignerId || null,
  }
}

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

const normalizeTriCode = normalizeVenueTriCode

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    if (isTwentyBackedEnabled('CG_DESIGNS')) {
      const { searchParams } = new URL(request.url)
      const statusFilter = searchParams.get('status')
      const filters: string[] = []
      if (statusFilter && statusFilter !== 'all') filters.push(`status[eq]:"${statusFilter}"`)
      const items: any[] = []
      let cursor: string | null = null
      for (let p = 0; p < 15; p++) {
        const page = await CgDesigns.list({
          limit: 60,
          startingAfter: cursor || undefined,
          filter: filters.length ? filters.join(',') : undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const c of page.items) items.push(reshapeCgDesign(c))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ cg_design_requests: items })
    }

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
      `SELECT cg.id, cg.league, cg.team_name, cg.job_title, cg.tricode, cg.notes, cg.due_date, cg.status,
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
      tricode,
      job_title,
      notes,
      designer_id,
      designer_ids,
      enterprise_contact_ids,
      due_date,
      status,
    } = body

    if (!job_title?.trim()) {
      return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
    }

    if (isTwentyBackedEnabled('CG_DESIGNS')) {
      try {
        const created = await CgDesigns.create({
          clientTriCode: normalizeTriCode(tricode) || job_title.trim(),
          teamName: team_name?.trim() || null,
          sport: null,
          status: normalizeStatus(status),
        })
        return NextResponse.json({ cg_design_request: { id: created.id, job_title: created.clientTriCode, status: created.status } })
      } catch (err) {
        console.error('[cg-designs POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create CG design request in Twenty' }, { status: 500 })
      }
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && venue_id && !venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const normalizedTriCode = normalizeTriCode(tricode)
    const resolvedVenueId = venue_id || await resolveVenueIdFromTriCode(normalizedTriCode)

    const result = await query(
      `INSERT INTO cg_design_requests (
        venue_id, league, team_name, job_title, tricode, notes, designer_id, due_date, status, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
      RETURNING id, job_title, status`,
      [
        resolvedVenueId || null,
        null,
        team_name?.trim() || null,
        job_title.trim(),
        normalizedTriCode,
        notes?.trim() || null,
        (Array.isArray(designer_ids) && designer_ids[0]) || designer_id || null,
        due_date || null,
        normalizeStatus(status),
      ],
    )

    const created = result.rows[0]
    const designerIds = Array.isArray(designer_ids)
      ? designer_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : (designer_id ? [designer_id] : [])
    const enterpriseContactIds = Array.isArray(enterprise_contact_ids)
      ? enterprise_contact_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : []

    for (const [idx, staffId] of Array.from(new Set(designerIds)).entries()) {
      await query(
        `INSERT INTO cg_design_designers (cg_design_request_id, staff_id, is_primary, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cg_design_request_id, staff_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [created.id, staffId, idx === 0, auth.userId],
      )
    }
    for (const staffId of Array.from(new Set(enterpriseContactIds))) {
      await query(
        `INSERT INTO cg_design_enterprise_contacts (cg_design_request_id, staff_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [created.id, staffId],
      )
    }

    return NextResponse.json({ cg_design_request: created })
  } catch (err) {
    console.error('Error creating CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
