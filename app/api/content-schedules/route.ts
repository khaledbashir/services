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

const ALLOWED_STATUSES = new Set([
  'ready',
  'in_queue',
  'scheduled_to_launch',
  'content_live',
  'confirmed_live',
])

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'in_queue'
  return ALLOWED_STATUSES.has(status) ? status : 'in_queue'
}

// ── Twenty ↔ Dashboard field reshaping ───────────────────────────────────────

function mapContentStatus(raw: string | null | undefined): string {
  if (!raw) return 'in_queue'
  const stripped = raw.toString().replace(/^STATUS_/i, '').toLowerCase()
  const map: Record<string, string> = {
    ready: 'ready',
    in_queue: 'in_queue',
    queued: 'in_queue',
    scheduled_to_launch: 'scheduled_to_launch',
    scheduled: 'scheduled_to_launch',
    content_live: 'content_live',
    live: 'content_live',
    confirmed_live: 'confirmed_live',
    confirmed: 'confirmed_live',
    done: 'confirmed_live',
    completed: 'confirmed_live',
  }
  return map[stripped] || stripped || 'in_queue'
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
      files_ready,
      status,
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
          status: normalizeStatus(status),
          notes: notes?.trim() || null,
        }
        if (venue_id) {
          const twentyVenueId = await dashboardVenueIdToTwentyId(venue_id)
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
