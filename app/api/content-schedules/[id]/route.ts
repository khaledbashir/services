export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import {
  ContentSchedule as ContentScheduleFacade,
  dashboardVenueIdToTwentyId,
  isTwentyBackedEnabled,
  type TwentyContentSchedule,
} from '@/lib/twenty-ops'
import { normalizeContentScheduleStatus } from '@/lib/content-schedule-status'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'company_name',
  'content_name',
  'launch_date',
  'end_date',
  'operator_id',
  'files_ready',
  'status',
  'notes',
  'file_location',
])

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'operator_id'].includes(key)) return value || null
  if (['company_name', 'content_name', 'notes', 'file_location'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return normalizeContentScheduleStatus(value)
  if (key === 'files_ready') return Boolean(value)
  if (key === 'launch_date' || key === 'end_date') return value || null
  return value
}

function toDateOnly(value: any) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

// ── Legacy: local-DB record access check ─────────────────────────────────────

async function getAccessibleRecord(request: NextRequest, id: string) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'cs.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT cs.id, cs.venue_id, cs.company_name, cs.content_name,
            CASE WHEN cs.launch_date IS NULL THEN NULL ELSE to_char(cs.launch_date::date, 'YYYY-MM-DD') END as launch_date,
            CASE WHEN cs.end_date IS NULL THEN NULL ELSE to_char(cs.end_date::date, 'YYYY-MM-DD') END as end_date,
            cs.operator_id, cs.files_ready, cs.file_location,
            cs.status, cs.notes, cs.created_at, cs.updated_at, v.name as venue_name, s.full_name as operator_name
     FROM content_schedules cs
     LEFT JOIN venues v ON cs.venue_id = v.id
     LEFT JOIN staff s ON cs.operator_id = s.id
     WHERE cs.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

// ── Twenty ↔ Dashboard reshape ───────────────────────────────────────────────

async function reshapeTwentyToDashboard(cs: TwentyContentSchedule) {
  const raw = cs as any
  const notesText = typeof raw.notes === 'object'
    ? (raw.notes?.markdown || raw.notes?.blocknote || '')
    : (raw.notes || '')
  return {
    id: cs.id,
    // contentSchedules has no venue relation — surface client as the locality label.
    venue_id: null,
    venue_name: raw.scheduleClient?.name || null,
    company_name: raw.scheduleClient?.name || null,
    content_name: raw.contentTitle || raw.name || '(unnamed)',
    launch_date: toDateOnly(raw.startDate || raw.runStartDate),
    end_date: toDateOnly(raw.endDate || raw.runEndDate),
    operator_id: null,
    operator_name: raw.operator || null,
    files_ready: !!raw.filesReady,
    status: normalizeContentScheduleStatus(raw.status),
    notes: notesText,
    proof_link: raw.proofLink || null,
    file_location: raw.ftpLocation || null,
    wrike_task_id: raw.wrikeTaskId || null,
    created_at: cs.createdAt,
    updated_at: cs.updatedAt,
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ── Twenty-backed path ──
    if (isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const cs = await ContentScheduleFacade.get(params.id)
      if (!cs) return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })
      const reshaped = await reshapeTwentyToDashboard(cs)
      return NextResponse.json({ content_schedule: reshaped })
    }

    // ── Legacy path ──
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })
    }
    return NextResponse.json({ content_schedule: access.record })
  } catch (err) {
    console.error('Error fetching content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ── Twenty-backed path ──
    if (isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const existing = await ContentScheduleFacade.get(params.id)
      if (!existing) return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })

      const body = await request.json()
      const payload: Record<string, unknown> = {}

      if (body.content_name?.trim()) payload.name = body.content_name.trim()
      if (body.launch_date !== undefined) payload.runStartDate = body.launch_date || null
      if (body.end_date !== undefined) payload.runEndDate = body.end_date || null
      if (body.status !== undefined) payload.status = normalizeContentScheduleStatus(body.status)
      if (body.notes !== undefined) payload.notes = body.notes?.trim() || null
      if (body.file_location !== undefined) payload.ftpLocation = body.file_location?.trim() || null
      if (body.venue_id !== undefined) {
        if (body.venue_id) {
          const twentyVenueId = await dashboardVenueIdToTwentyId(body.venue_id)
          if (twentyVenueId) payload.contentScheduleVenueId = twentyVenueId
        } else {
          payload.contentScheduleVenueId = null
        }
      }

      if (Object.keys(payload).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
      }

      const updated = await ContentScheduleFacade.update(params.id, payload as Partial<TwentyContentSchedule>)
      const reshaped = await reshapeTwentyToDashboard(updated)
      return NextResponse.json({ content_schedule: reshaped })
    }

    // ── Legacy path ──
    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Content schedule not found' }, { status: 404 })
    }

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    let index = 1

    for (const key of Object.keys(body)) {
      if (!ALLOWED_PATCH_FIELDS.has(key)) continue
      const value = normalizeValue(key, body[key])
      if (value === undefined) continue
      updates.push(`${key} = $${index++}`)
      values.push(value)
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE content_schedules
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, content_name, status, updated_at`,
      values,
    )

    return NextResponse.json({ content_schedule: result.rows[0] })
  } catch (err) {
    console.error('Error updating content schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // ── Twenty-backed path ──
  if (isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth
    try {
      await ContentScheduleFacade.delete(params.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[content-schedule DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete content schedule' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Delete not supported' }, { status: 405 })
}
