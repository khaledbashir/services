export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { Designs, isTwentyBackedEnabled, type TwentyDesignRequest } from '@/lib/twenty-ops'
import { normalizeVenueTriCode, resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { loadDesignAssignmentSummaries, splitDesignAssignments } from '@/lib/work-assignment-summaries'
import { loadTriCodeMap, upsertTriCode } from '@/lib/tricode-side-tables'
import { logDesignActivity } from '@/lib/design-activity'
import { assessDesignBrief } from '@/lib/design-brief'

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
    cancelled: 'cancelled',
    canceled: 'cancelled',
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
  'cancelled',
])

// Terminal statuses excluded from the default "active" view (mirrors how `done`
// is excluded). Cancelled requests are findable via the explicit "all" filter.
const INACTIVE_STATUSES = new Set(['done', 'cancelled'])

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'request_submitted'
  return ALLOWED_STATUSES.has(status) ? status : 'request_submitted'
}

const normalizeTriCode = normalizeVenueTriCode

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
      if (statusFilter && statusFilter !== 'all') {
        const twentyStatus = statusFilter.startsWith('STATUS_') ? statusFilter : toTwentyStatus(statusFilter)
        filters.push(`status[eq]:"${twentyStatus}"`)
      }
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
      const [tagMap, priorityMap, triCodeMap] = await Promise.all([
        loadInternalCategoryMap(ids),
        loadPriorityMap(ids),
        loadTriCodeMap('design_request_tricodes', ids),
      ])
      const assignmentMap = await loadDesignAssignmentSummaries(ids)
      for (const item of items) {
        item.internal_category = tagMap.get(item.id) || null
        item.priority = priorityMap.get(item.id) || null
        item.tricode = triCodeMap.get(item.id) || item.tricode || null
        const split = splitDesignAssignments(assignmentMap.get(item.id))
        item.designers = split.designers.length
          ? split.designers
          : (item.designer_id && item.designer_name ? [{ id: item.designer_id, full_name: item.designer_name, role: 'designer', is_primary: true }] : [])
        item.enterprise_contacts = split.enterprise_contacts
      }
      return NextResponse.json({ design_requests: items, total: items.length, limit })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const venueIdFilter = searchParams.get('venue_id')

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const vf = buildVenueFilterClause(venueIds, 'dr.venue_id', 1)

    const conditions: string[] = ['dr.deleted_at IS NULL']
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

    const rows = result.rows
    const assignmentMap = await loadDesignAssignmentSummaries(rows.map((row) => row.id))
    for (const row of rows) {
      const split = splitDesignAssignments(assignmentMap.get(row.id))
      row.designers = split.designers
      row.enterprise_contacts = split.enterprise_contacts
    }

    return NextResponse.json({
      design_requests: rows,
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
      project_file_location,
      final_file_name,
      final_duration,
      notes,
      boards_requested,
      sizes_requested,
      designer_id,
      designer_ids,
      enterprise_contact_id,
      enterprise_contact_ids,
      status,
      hours_estimated,
      hours_spent,
      due_date,
      is_rando,
    } = body

    if (!job_title?.trim()) {
      return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
    }
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }
    const normalizedTriCode = normalizeTriCode(tricode)
    if (!normalizedTriCode) {
      return NextResponse.json({ error: 'tricode is required' }, { status: 400 })
    }

    // Brief gating (Charlie 2026-08-19, Daniel Croci Apr 2026). A ticket a
    // designer cannot work from does not fail loudly — it turns into revision
    // rounds on work ANC already runs at a loss. Intake is the cheap moment.
    //
    // This gates the human path only. The old tracker's importer writes rows
    // directly in scripts/import-wrike-airtable.ts and never reaches this route,
    // so historical syncing is unaffected.
    const brief = assessDesignBrief({
      notes,
      boardsRequested: boards_requested,
      sizesRequested: sizes_requested,
      projectFileLocation: project_file_location,
    })
    const briefWaived = body.allow_incomplete_brief === true
    if (!brief.complete && !briefWaived) {
      return NextResponse.json(
        {
          error: 'This brief is not complete enough for a designer to start.',
          missing: brief.missing,
          // The caller can proceed anyway, but has to say so — and it is recorded.
          hint: 'Resend with allow_incomplete_brief: true to submit it as-is.',
        },
        { status: 422 },
      )
    }

    if (isTwentyBackedEnabled('DESIGNS')) {
      try {
        const created = await Designs.create({
          name: job_title.trim(),
          aiPrompt: notes?.trim() || null,
          boardSection: boards_requested?.trim() || null,
          proofLink: ftp_proof_link?.trim() || null,
          projectLocation: project_file_location?.trim() || null,
          localFilePath: final_file_name?.trim() || null,
          status: toTwentyStatus(status) as any,
        })
        // Twenty's designRequests has no tri-code field — persist via side table.
        const savedTriCode = await upsertTriCode('design_request_tricodes', created.id, normalizedTriCode)
        return NextResponse.json({ design_request: { id: created.id, job_title: created.name, status: created.status, tricode: savedTriCode } })
      } catch (err) {
        console.error('[design-requests POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create design request in Twenty' }, { status: 500 })
      }
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && venue_id && !venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Auto-resolve venue from tricode using venues.aliases (Alexis 5/27: try
    // codes like PACERS-XXX should land on the right venue automatically).
    let resolvedVenueId = venue_id
    if (!resolvedVenueId && normalizedTriCode) resolvedVenueId = await resolveVenueIdFromTriCode(normalizedTriCode)

    const result = await query(
      `INSERT INTO design_requests (
        venue_id, company_name, job_title, tricode, ftp_proof_link, ftp_final_link, project_file_location,
        final_file_name, final_duration, notes, boards_requested, sizes_requested,
        designer_id, enterprise_contact_id, status, hours_estimated, hours_spent, due_date, is_rando, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      RETURNING id, job_title, status, is_rando`,
      [
        resolvedVenueId,
        company_name?.trim() || null,
        job_title.trim(),
        normalizedTriCode,
        ftp_proof_link?.trim() || null,
        ftp_final_link?.trim() || null,
        project_file_location?.trim() || null,
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

    const created = result.rows[0]
    const designerIds = Array.isArray(designer_ids)
      ? designer_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : (designer_id ? [designer_id] : [])
    const enterpriseContactIds = Array.isArray(enterprise_contact_ids)
      ? enterprise_contact_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : (enterprise_contact_id ? [enterprise_contact_id] : [])

    for (const [idx, staffId] of Array.from(new Set(designerIds)).entries()) {
      await query(
        `INSERT INTO design_request_designers (design_request_id, staff_id, is_primary, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (design_request_id, staff_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [created.id, staffId, idx === 0, auth.userId],
      )
    }
    for (const staffId of Array.from(new Set(enterpriseContactIds))) {
      await query(
        `INSERT INTO design_request_enterprise_contacts (design_request_id, staff_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [created.id, staffId],
      )
    }

    await logDesignActivity({
      designRequestId: created.id,
      eventType: 'created',
      actor: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
      toValue: created.status || null,
      detail: {
        jobTitle: created.job_title || null,
        designerCount: Array.from(new Set(designerIds)).length,
      },
    })

    // A waived brief is allowed but never invisible — the ticket carries who
    // submitted it short and what was missing, so the pattern is answerable
    // rather than anecdotal.
    if (briefWaived && !brief.complete) {
      await logDesignActivity({
        designRequestId: created.id,
        eventType: 'note',
        actor: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
        toValue: 'incomplete_brief_submitted',
        detail: { missing: brief.missing, directionLength: brief.directionLength },
      })
    }

    return NextResponse.json({
      design_request: created,
      brief: { complete: brief.complete, missing: brief.missing, waived: briefWaived && !brief.complete },
    })
  } catch (err) {
    console.error('Error creating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
