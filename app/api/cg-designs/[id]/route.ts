export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { CgDesigns, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import {
  emptyStatusNotification,
  getCgDesignAssigneeIds,
  notifyAssigneesOfStatusChange,
} from '@/lib/assignee-status-notifications'
import { sendAssignmentEmail } from '@/lib/assignment-emails'
import { logCgDesignActivity } from '@/lib/cg-design-activity'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'league',
  'team_name',
  'tricode',
  'job_title',
  'notes',
  'designer_id',
  'due_date',
  'status',
  'project_file_location',
])

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_progress',
  'submitted_internally',
  'client_review',
  'review',
  'revisions',
  'approved',
  'on_hold',
  'request_closed',
  'posted',
  'cancelled',
])

function mapCgStatus(raw: string | null | undefined): string {
  if (!raw) return 'request_submitted'
  const stripped = raw.replace(/^STATUS_/i, '').toLowerCase()
  const aliases: Record<string, string> = {
    submitted: 'request_submitted',
    review: 'submitted_internally',
    in_review: 'submitted_internally',
    posted: 'request_closed',
    done: 'request_closed',
    closed: 'request_closed',
  }
  return aliases[stripped] || stripped
}

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'designer_id'].includes(key)) return value || null
  if (['league', 'team_name', 'job_title', 'notes', 'project_file_location'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'tricode') {
    if (typeof value !== 'string') return null
    const cleaned = value.toUpperCase().replace(/[^A-Z-]/g, '')
    const normalized = cleaned.split('-').slice(0, 2).map((p) => p.slice(0, 3)).join('-')
    return /^[A-Z]{1,3}(-[A-Z]{1,3})?$/.test(normalized) ? normalized : null
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'due_date') return value || null
  return value
}

async function getAccessibleRecord(request: NextRequest, id: string) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'cg.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT cg.id, cg.venue_id, cg.league, cg.team_name, cg.job_title, cg.tricode, cg.notes, cg.designer_id, cg.due_date, cg.status,
            cg.project_file_location, cg.ftp_proof_link, cg.legacy_ftp_proof_link,
            cg.created_at, cg.updated_at, v.name as venue_name, s.full_name as designer_name
     FROM cg_design_requests cg
     LEFT JOIN venues v ON cg.venue_id = v.id
     LEFT JOIN staff s ON cg.designer_id = s.id
     WHERE cg.id = $1 AND cg.deleted_at IS NULL ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('CG_DESIGNS')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const c = await CgDesigns.get(params.id)
      if (!c) return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
      return NextResponse.json({
        cg_design_request: {
          id: c.id, job_title: c.clientTriCode, team_name: c.teamName, league: c.sport,
          tricode: c.clientTriCode,
          status: mapCgStatus(c.status), created_at: c.createdAt, updated_at: c.updatedAt,
          designer_id: c.cgDesignerId,
          designer_name: c.cgDesigner ? `${c.cgDesigner.name.firstName} ${c.cgDesigner.name.lastName}`.trim() : null,
          venue_name: c.cgClient?.name || null,
          project_file_location: (c as any).projectFileLocation || (c as any).projectLocation || null,
          ftp_proof_link: (c as any).proofShareUrl || (c as any).proofLink || null,
        },
      })
    }

    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
    }
    return NextResponse.json({ cg_design_request: access.record })
  } catch (err) {
    console.error('Error fetching CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('CG_DESIGNS')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const body = await request.json()
      const prior = await CgDesigns.get(params.id)
      if (body.status === 'request_closed') {
        const priorStatus = mapCgStatus((prior as any)?.status || null)
        const proofUrl = (prior as any)?.proofShareUrl || (prior as any)?.proofLink || null
        if (!proofUrl || priorStatus !== 'approved') {
          return NextResponse.json({ error: 'Client proof approval is required before closing this request' }, { status: 409 })
        }
      }
      const patch: Record<string, unknown> = {}
      if ('job_title' in body) patch.clientTriCode = body.job_title?.trim() || null
      if ('team_name' in body) patch.teamName = body.team_name?.trim() || null
      if ('tricode' in body) patch.clientTriCode = normalizeValue('tricode', body.tricode)
      if ('league' in body) patch.sport = body.league?.trim() || null
      if ('status' in body && ALLOWED_STATUSES.has(body.status)) patch.status = body.status
      if ('project_file_location' in body) patch.projectFileLocation = body.project_file_location?.trim() || null
      const updated = await CgDesigns.update(params.id, patch)
      const priorStatus = (prior as any)?.status || null
      const notificationSummary = body.status && ALLOWED_STATUSES.has(body.status) && body.status !== priorStatus
        ? await notifyAssigneesOfStatusChange({
            kind: 'CG Request',
            recordId: params.id,
            title: (updated as any).name || (updated as any).clientTriCode || (prior as any)?.clientTriCode || params.id,
            previousStatus: priorStatus,
            status: body.status,
            path: `/cg-designs/${params.id}`,
            assigneeIds: await getCgDesignAssigneeIds(params.id, [
              (updated as any).cgDesignerId,
              (prior as any)?.cgDesignerId,
            ]),
          })
        : emptyStatusNotification()
      return NextResponse.json({ cg_design_request: { id: updated.id, job_title: updated.clientTriCode, status: updated.status }, assignee_notifications: notificationSummary })
    }

    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
    }

    const body = await request.json()
    if (body.status === 'request_closed' && (!access.record.ftp_proof_link || access.record.status !== 'approved')) {
      return NextResponse.json({ error: 'Client proof approval is required before closing this request' }, { status: 409 })
    }
    const normalizedNextStatus = ALLOWED_STATUSES.has(body.status) ? body.status : null
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
      `UPDATE cg_design_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, job_title, status, updated_at`,
      values,
    )

    // Email a newly-assigned designer (fire-and-forget — never blocks the response).
    const nextDesignerId = body.designer_id !== undefined ? (body.designer_id || null) : undefined
    if (nextDesignerId && nextDesignerId !== access.record.designer_id) {
      sendAssignmentEmail({
        kind: 'cg',
        recordId: params.id,
        recordTitle: access.record.job_title,
        client: access.record.team_name || access.record.venue_name || null,
        dueDate: body.due_date !== undefined ? body.due_date || null : access.record.due_date,
        assigneeUserIds: [nextDesignerId],
        assignedByName: access.auth.fullName,
        assignedByUserId: access.auth.userId,
        assignedByEmail: access.auth.email,
      }).catch((err) => console.error('[cg-designs PATCH] assignment email failed:', err))
    }

    const notificationSummary = normalizedNextStatus && normalizedNextStatus !== access.record.status
      ? await notifyAssigneesOfStatusChange({
          kind: 'CG Request',
          recordId: params.id,
          title: access.record.job_title,
          previousStatus: access.record.status,
          status: normalizedNextStatus,
          path: `/cg-designs/${params.id}`,
          assigneeIds: await getCgDesignAssigneeIds(params.id),
        })
      : emptyStatusNotification()

    if (normalizedNextStatus && normalizedNextStatus !== access.record.status) {
      await logCgDesignActivity({
        cgDesignRequestId: params.id,
        eventType: 'status_change',
        actor: access.auth,
        fromValue: access.record.status,
        toValue: normalizedNextStatus,
      })
    }

    return NextResponse.json({ cg_design_request: result.rows[0], assignee_notifications: notificationSummary })
  } catch (err) {
    console.error('Error updating CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('CG_DESIGNS')) {
      const auth = await requireRole(request, 'admin')
      if (isAuthError(auth)) return auth
      // Twenty's REST DELETE is a soft-delete (stamps deletedAt, recoverable).
      await CgDesigns.delete(params.id)
      return NextResponse.json({ success: true })
    }

    const access = await getAccessibleRecord(request, params.id)
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'CG design request not found' }, { status: 404 })
    }

    // Soft-delete: stamp deleted_at; row drops out of every view, recoverable.
    await query('UPDATE cg_design_requests SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting CG design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
