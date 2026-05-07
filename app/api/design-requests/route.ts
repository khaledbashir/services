export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { Designs, isTwentyBackedEnabled, type TwentyDesignRequest } from '@/lib/twenty-ops'

function normalizeTwentyStatus(raw: string | null | undefined): string {
  if (!raw) return 'request_submitted'
  // Twenty stores STATUS_DONE / STATUS_IN_PROGRESS etc. — strip prefix + lowercase.
  const stripped = raw.toString().replace(/^STATUS_/i, '').toLowerCase()
  // Map Twenty's canonical statuses to the dashboard's pipeline vocabulary.
  const map: Record<string, string> = {
    submitted: 'request_submitted',
    request_submitted: 'request_submitted',
    queued: 'in_queue',
    in_queue: 'in_queue',
    in_progress: 'in_progress',
    in_qc: 'in_qc',
    qc: 'in_qc',
    client_review: 'client_review',
    review: 'client_review',
    approved: 'approved',
    done: 'done',
    completed: 'done',
  }
  return map[stripped] || stripped || 'request_submitted'
}

function reshapeDesign(d: TwentyDesignRequest) {
  const raw = d as any
  const companyName = raw.designClient?.name || null
  const notesText = typeof raw.notes === 'object'
    ? (raw.notes?.markdown || raw.notes?.blocknote || '')
    : (raw.notes || raw.aiPrompt || '')
  return {
    id: d.id,
    job_title: d.name,
    company_name: companyName,
    tricode: raw.clientTriCode || null,
    ftp_proof_link: raw.proofShareUrl || raw.proofLink || raw.ftpProofLink || null,
    ftp_final_link: raw.ftpFinalLink || null,
    final_file_name: raw.localFilePath || null,
    final_duration: null,
    notes: notesText,
    ai_prompt: raw.aiPrompt || null,
    boards_requested: raw.boardSection || null,
    sizes_requested: raw.sizes || null,
    status: normalizeTwentyStatus(raw.status),
    hours_estimated: raw.effortHours ?? null,
    hours_spent: null,
    due_date: raw.dueDate || null,
    created_at: d.createdAt,
    created_date: new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    updated_date: new Date(d.updatedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    // Twenty's designRequests have no venue relation — only a client company.
    // Surface the company as the venue label so cards don't read "No venue".
    venue_name: companyName,
    venue_id: null,
    designer_name: raw.designAssignee ? `${raw.designAssignee.name.firstName} ${raw.designAssignee.name.lastName}`.trim() : null,
    designer_id: raw.designAssigneeId,
    enterprise_contact_name: null,
    enterprise_contact_id: null,
    wrike_task_id: raw.wrikeTaskId || null,
    proof_sent_at: raw.proofSentAt || null,
    proof_view_count: raw.proofViewCount ?? 0,
    proof_last_viewed_at: raw.proofLastViewedAt || null,
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

// Dashboard status values → Twenty's STATUS_ enum values.
// Required on any write (create + PATCH with status in body) because Twenty
// rejects `request_submitted`/`in_queue`/etc. with `Invalid value "..."
// for field "status"`.
function toTwentyStatus(dashboardValue: string): string {
  const normalized = normalizeStatus(dashboardValue)
  return `STATUS_${normalized.toUpperCase()}`
}

async function loadInternalCategoryMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const res = await query(
    `SELECT design_request_id, category
     FROM design_request_internal_categories
     WHERE design_request_id = ANY($1::text[])`,
    [ids],
  )
  for (const row of res.rows) map.set(row.design_request_id, row.category)
  return map
}

async function loadPriorityMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  // Side table is created on first PUT in /priority route — guard against
  // pre-table state by swallowing the error and returning empty map.
  try {
    const res = await query(
      `SELECT design_request_id, priority
       FROM design_request_priorities
       WHERE design_request_id = ANY($1::text[])`,
      [ids],
    )
    for (const row of res.rows) map.set(row.design_request_id, row.priority)
  } catch {}
  return map
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
      const ids = items.map((i) => i.id)
      const [tagMap, priorityMap] = await Promise.all([
        loadInternalCategoryMap(ids),
        loadPriorityMap(ids),
      ])
      for (const item of items) {
        item.internal_category = tagMap.get(item.id) || null
        item.priority = priorityMap.get(item.id) || null
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
              dr.status, dr.hours_estimated, dr.hours_spent, dr.due_date, dr.is_rando,
              dr.created_at,
              TO_CHAR(dr.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(dr.updated_at, 'Mon DD, YYYY') as updated_date,
              v.name as venue_name, v.id as venue_id,
              d.full_name as designer_name, d.id as designer_id,
              ec.full_name as enterprise_contact_name, ec.id as enterprise_contact_id,
              ic.category as internal_category,
              prio.priority as priority
       FROM design_requests dr
       LEFT JOIN venues v ON dr.venue_id = v.id
       LEFT JOIN staff d ON dr.designer_id = d.id
       LEFT JOIN staff ec ON dr.enterprise_contact_id = ec.id
       LEFT JOIN design_request_internal_categories ic ON ic.design_request_id = dr.id::text
       LEFT JOIN design_request_priorities prio ON prio.design_request_id = dr.id::text
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
      is_rando,
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
          status: toTwentyStatus(status) as any,
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
        designer_id, enterprise_contact_id, status, hours_estimated, hours_spent, due_date, is_rando, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, NOW()
      )
      RETURNING id, job_title, status, is_rando`,
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
        !!is_rando,
      ],
    )

    return NextResponse.json({ design_request: result.rows[0] })
  } catch (err) {
    console.error('Error creating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
