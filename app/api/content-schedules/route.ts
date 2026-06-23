export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import {
  ContentSchedule as ContentScheduleFacade,
  buildTwentyVenueFilter,
  dashboardVenueIdToTwentyId,
  isTwentyBackedEnabled,
  type TwentyContentSchedule,
} from '@/lib/twenty-ops'
import { resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { normalizeContentScheduleStatus } from '@/lib/content-schedule-status'
import { loadContentAssignmentSummaries, splitContentAssignments } from '@/lib/work-assignment-summaries'

// ── Twenty ↔ Dashboard field reshaping ───────────────────────────────────────

function mapContentStatus(raw: string | null | undefined): string {
  return normalizeContentScheduleStatus(raw)
}

async function reshapeTwentyToDashboard(cs: TwentyContentSchedule) {
  const raw = cs as any
  const notesText = typeof raw.notes === 'object'
    ? (raw.notes?.markdown || raw.notes?.blocknote || '')
    : (raw.notes || '')
  return {
    id: cs.id,
    company_name: raw.scheduleClient?.name || null,
    content_name: raw.contentTitle || raw.name || '(unnamed)',
    launch_date: raw.startDate || null,
    end_date: raw.endDate || null,
    files_ready: !!raw.filesReady,
    status: mapContentStatus(raw.status),
    notes: notesText,
    // contentSchedules have no venue relation in Twenty — they're client-scoped.
    // Fall back to the client name so the UI "venue" column reads meaningfully.
    venue_name: raw.scheduleClient?.name || null,
    venue_id: null,
    operator_name: raw.operator || null,
    operator_id: null,
    proof_link: raw.proofLink || null,
    ftp_location: raw.ftpLocation || null,
    wrike_task_id: raw.wrikeTaskId || null,
    created_date: cs.createdAt ? new Date(cs.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '',
    updated_date: cs.updatedAt ? new Date(cs.updatedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '',
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const venueIdFilter = searchParams.get('venue_id')

    // ── Twenty-backed path ──
    if (isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
      try {
        const filters: string[] = []
        // contentSchedules has no venue relation in Twenty — silently ignore
        // venue filters rather than 500 the request. Team can filter by client
        // instead once we expose it in the UI.
        if (statusFilter && statusFilter !== 'all') {
          filters.push(`status[eq]:"${statusFilter}"`)
        }

        const items: any[] = []
        let cursor: string | null = null
        for (let p = 0; p < 50; p++) {
          const page = await ContentScheduleFacade.list({
            limit: 60,
            startingAfter: cursor || undefined,
            filter: filters.length > 0 ? filters.join(',') : undefined,
            // Twenty's actual field is `startDate`, not `runStartDate`. Wrong
            // name threw a silent 400 and the list came back empty.
            orderBy: 'startDate[AscNullsLast]',
          })
          for (const cs of page.items) items.push(await reshapeTwentyToDashboard(cs))
          if (!page.hasNextPage || !page.nextCursor) break
          cursor = page.nextCursor
        }

        const assignmentMap = await loadContentAssignmentSummaries(items.map((item) => item.id))
        for (const item of items) {
          const split = splitContentAssignments(assignmentMap.get(item.id))
          item.operators = split.operators.length
            ? split.operators
            : (item.operator_id && item.operator_name ? [{ id: item.operator_id, full_name: item.operator_name, role: 'operator', is_primary: true }] : [])
          item.enterprise_contacts = split.enterprise_contacts
        }

        return NextResponse.json({ content_schedules: items })
      } catch (err) {
        console.error('[content-schedules GET twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to list content schedules from Twenty' }, { status: 500 })
      }
    }

    // ── Legacy local-DB path ──
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
      `SELECT cs.id, cs.company_name, cs.content_name, cs.launch_date, cs.end_date, cs.files_ready, cs.status, cs.file_location, cs.notes,
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

    const rows = result.rows
    const assignmentMap = await loadContentAssignmentSummaries(rows.map((row) => row.id))
    for (const row of rows) {
      const split = splitContentAssignments(assignmentMap.get(row.id))
      row.operators = split.operators
      row.enterprise_contacts = split.enterprise_contacts
    }

    return NextResponse.json({ content_schedules: rows })
  } catch (err) {
    console.error('Error fetching content schedules:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

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
      operator_ids,
      enterprise_contact_ids,
      files_ready,
      status,
      venue_tricode,
      file_location,
      notes,
    } = body

    if (!content_name?.trim()) {
      return NextResponse.json({ error: 'content_name is required' }, { status: 400 })
    }

    // ── Twenty-backed path ──
    if (isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
      try {
        const payload: Record<string, unknown> = {
          name: content_name.trim(),
          runStartDate: launch_date || null,
          runEndDate: end_date || null,
          status: normalizeContentScheduleStatus(status),
          notes: notes?.trim() || null,
          ftpLocation: file_location?.trim() || null,
        }
        const resolvedVenueId = venue_id || await resolveVenueIdFromTriCode(venue_tricode)
        if (resolvedVenueId) {
          const twentyVenueId = await dashboardVenueIdToTwentyId(resolvedVenueId)
          if (twentyVenueId) payload.contentScheduleVenueId = twentyVenueId
        }
        // company_name is a text field in legacy; in Twenty it's a relation.
        // For now, store in notes if no matching company relation is found.
        if (company_name?.trim()) {
          payload.notes = [payload.notes, `Client: ${company_name.trim()}`].filter(Boolean).join('\n')
        }

        const created = await ContentScheduleFacade.create(payload as Partial<TwentyContentSchedule>)
        const reshaped = await reshapeTwentyToDashboard(created)
        return NextResponse.json({ content_schedule: reshaped })
      } catch (err) {
        console.error('[content-schedules POST twenty-backed] error:', err)
        return NextResponse.json({ error: 'Failed to create content schedule in Twenty' }, { status: 500 })
      }
    }

    // ── Legacy local-DB path ──
    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const resolvedVenueId = venue_id || await resolveVenueIdFromTriCode(venue_tricode)
    if (auth.role === 'technician' && Array.isArray(venueIds) && venueIds.length > 0 && resolvedVenueId && !venueIds.includes(resolvedVenueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await query(
      `INSERT INTO content_schedules (
        venue_id, company_name, content_name, launch_date, end_date, operator_id, files_ready, status, file_location, notes, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
      )
      RETURNING id, content_name, status`,
      [
        resolvedVenueId || null,
        company_name?.trim() || null,
        content_name.trim(),
        launch_date || null,
        end_date || null,
        (Array.isArray(operator_ids) && operator_ids[0]) || operator_id || null,
        Boolean(files_ready),
        normalizeContentScheduleStatus(status),
        file_location?.trim() || null,
        notes?.trim() || null,
      ],
    )

    const created = result.rows[0]
    const operatorIds = Array.isArray(operator_ids)
      ? operator_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : (operator_id ? [operator_id] : [])
    const enterpriseContactIds = Array.isArray(enterprise_contact_ids)
      ? enterprise_contact_ids.filter((id: any) => typeof id === 'string' && id.trim())
      : []

    for (const [idx, staffId] of Array.from(new Set(operatorIds)).entries()) {
      await query(
        `INSERT INTO content_schedule_operators (content_schedule_id, staff_id, is_primary, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (content_schedule_id, staff_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [created.id, staffId, idx === 0, auth.userId],
      )
    }
    for (const staffId of Array.from(new Set(enterpriseContactIds))) {
      await query(
        `INSERT INTO content_schedule_enterprise_contacts (content_schedule_id, staff_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [created.id, staffId],
      )
    }

    return NextResponse.json({ content_schedule: created })
  } catch (err) {
    console.error('Error creating content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
