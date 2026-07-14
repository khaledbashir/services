export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { createDesignProofShare } from '@/lib/design-proof'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { awardPointsOnce } from '@/lib/gamification'
import { logDesignActivity, type DesignActivityType } from '@/lib/design-activity'
import { sendAssignmentEmail } from '@/lib/assignment-emails'
import { resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { upsertTriCode, getTriCode } from '@/lib/tricode-side-tables'
import {
  getDesignRequestAssigneeIds,
  notifyAssigneesOfStatusChange,
} from '@/lib/assignee-status-notifications'

const ALLOWED_PATCH_FIELDS = new Set([
  'venue_id',
  'company_name',
  'client_name',
  'client_email',
  'job_title',
  'tricode',
  'ftp_proof_link',
  'ftp_final_link',
  'final_file_name',
  'final_duration',
  'notes',
  'boards_requested',
  'sizes_requested',
  'designer_id',
  'enterprise_contact_id',
  'status',
  'hours_estimated',
  'hours_spent',
  'due_date',
  'is_rando',
])

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

function normalizeValue(key: string, value: any) {
  if (value === undefined) return undefined
  if (['venue_id', 'designer_id', 'enterprise_contact_id'].includes(key)) return value || null
  if (['company_name', 'client_name', 'client_email', 'job_title', 'tricode', 'ftp_proof_link', 'ftp_final_link', 'final_file_name', 'final_duration', 'notes', 'boards_requested', 'sizes_requested'].includes(key)) {
    return typeof value === 'string' ? value.trim() || null : value
  }
  if (key === 'status') return ALLOWED_STATUSES.has(value) ? value : undefined
  if (key === 'hours_estimated' || key === 'hours_spent') return value === '' ? null : value
  if (key === 'due_date') return value || null
  if (key === 'is_rando') return !!value
  return value
}

function getBudgetThresholdState(hoursSpent: number | null | undefined, hoursEstimated: number | null | undefined) {
  const spent = Number(hoursSpent || 0)
  const estimated = Number(hoursEstimated || 0)
  if (!estimated || estimated <= 0) return false
  return spent >= estimated * 0.75
}

async function getAccessibleRecord(request: NextRequest, id: string, minRole: 'technician' | 'admin') {
  const auth = await requireRole(request, minRole)
  if (isAuthError(auth)) return auth

  const venueIds = await getStaffVenueIds(auth.userId, auth.role)
  const vf = buildVenueFilterClause(venueIds, 'dr.venue_id', 2)
  const params: any[] = [id, ...vf.params]

  const result = await query(
    `SELECT dr.id, dr.venue_id, dr.job_title, dr.company_name, dr.tricode,
            dr.ftp_proof_link, dr.legacy_ftp_proof_link, dr.ftp_final_link, dr.final_file_name, dr.final_duration,
            dr.notes, dr.boards_requested, dr.sizes_requested, dr.designer_id,
            dr.enterprise_contact_id, dr.status, dr.hours_estimated, dr.hours_spent,
            dr.due_date, dr.is_rando, dr.created_at, dr.updated_at,
            dr.qc_approved_by_name, dr.qc_approved_by_email, dr.qc_approved_at,
            v.name as venue_name,
            d.full_name as designer_name,
            ec.full_name as enterprise_contact_name,
            ic.category as internal_category,
            prio.priority as priority
     FROM design_requests dr
     LEFT JOIN venues v ON dr.venue_id = v.id
     LEFT JOIN staff d ON dr.designer_id = d.id
     LEFT JOIN staff ec ON dr.enterprise_contact_id = ec.id
     LEFT JOIN design_request_internal_categories ic ON ic.design_request_id = dr.id::text
     LEFT JOIN design_request_priorities prio ON prio.design_request_id = dr.id::text
     WHERE dr.id = $1 AND dr.deleted_at IS NULL ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Helper for the Twenty-backed branch: lookup the local internal-category
    // tag (Twenty has no concept of this taxonomy).
    const lookupInternalCategory = async (id: string): Promise<string | null> => {
      try {
        const r = await query(
          `SELECT category FROM design_request_internal_categories WHERE design_request_id = $1`,
          [id],
        )
        return r.rows[0]?.category || null
      } catch {
        return null
      }
    }
    // Same — priority lives in our side table, Twenty doesn't know it.
    const lookupPriority = async (id: string): Promise<string | null> => {
      try {
        const r = await query(
          `SELECT priority FROM design_request_priorities WHERE design_request_id = $1`,
          [id],
        )
        return r.rows[0]?.priority || null
      } catch {
        return null
      }
    }
    // QC sign-off lives on the local design_requests row even in Twenty mode.
    const lookupQcApproval = async (id: string) => {
      try {
        const r = await query(
          `SELECT qc_approved_by_name, qc_approved_by_email, qc_approved_at FROM design_requests WHERE id::text = $1`,
          [id],
        )
        return r.rows[0] || null
      } catch {
        return null
      }
    }
    const lookupLegacyProofLink = async (id: string): Promise<string | null> => {
      try {
        const r = await query(
          `SELECT legacy_ftp_proof_link FROM design_requests WHERE id = $1`,
          [id],
        )
        return r.rows[0]?.legacy_ftp_proof_link || null
      } catch {
        return null
      }
    }

    if (isTwentyBackedEnabled('DESIGNS')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const d = await Designs.get(params.id) as any
      if (!d) {
        // Twenty doesn't know this id — fall back to the local mirror so
        // stranded locally-created rows (e.g. AI skill creates before we
        // started double-writing) still resolve. If local also misses,
        // then it's genuinely not found.
        const access = await getAccessibleRecord(request, params.id, 'technician')
        if (access instanceof NextResponse) return access
        if (!access.record) {
          return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
        }
        return NextResponse.json({ design_request: access.record })
      }
      // Normalize Twenty's STATUS_DONE etc. back to dashboard vocab so the
      // new stage timeline UI can highlight the correct stage.
      const status = ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted'
      const notesText = typeof d.notes === 'object'
        ? (d.notes?.markdown || d.notes?.blocknote || '')
        : (d.notes || d.aiPrompt || '')
      const companyName = d.designClient?.name || null
      const qc = await lookupQcApproval(d.id)
      return NextResponse.json({
        design_request: {
          id: d.id,
          job_title: d.name,
          company_name: companyName,
          // Designs don't have a venue relation in Twenty — fall back to client
          // so the header + sidebar don't read "No client / No venue".
          venue_name: companyName,
          venue_id: null,
          tricode: (await getTriCode('design_request_tricodes', d.id)) || d.clientTriCode || null,
          status,
          notes: notesText,
          ai_prompt: d.aiPrompt || null,
          boards_requested: d.boardSection || null,
          sizes_requested: d.sizes || null,
          ftp_proof_link: d.proofShareUrl || d.proofLink || d.ftpProofLink || null,
          legacy_ftp_proof_link: await lookupLegacyProofLink(d.id),
          ftp_final_link: d.ftpFinalLink || null,
          final_file_name: d.localFilePath || null,
          final_duration: null,
          hours_estimated: d.effortHours ?? null,
          hours_spent: null,
          due_date: d.dueDate || null,
          designer_id: d.designAssigneeId || null,
          designer_name: d.designAssignee ? `${d.designAssignee.name.firstName} ${d.designAssignee.name.lastName}`.trim() : null,
          enterprise_contact_id: null,
          enterprise_contact_name: null,
          proof_sent_at: d.proofSentAt || null,
          proof_view_count: d.proofViewCount ?? 0,
          proof_last_viewed_at: d.proofLastViewedAt || null,
          wrike_task_id: d.wrikeTaskId || null,
          created_at: d.createdAt,
          updated_at: d.updatedAt,
          internal_category: await lookupInternalCategory(d.id),
          priority: await lookupPriority(d.id),
          qc_approved_by_name: qc?.qc_approved_by_name || null,
          qc_approved_by_email: qc?.qc_approved_by_email || null,
          qc_approved_at: qc?.qc_approved_at || null,
        },
      })
    }

    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
    return NextResponse.json({ design_request: access.record })
  } catch (err) {
    console.error('Error fetching design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const body = await request.json()

      // Detect the client-review transition BEFORE writing so we can auto-fire
      // the proof share + client email (same behaviour as the legacy path).
      // This bug bit us in the team demo on 2026-04-22 — the Twenty-backed
      // branch was silently skipping createDesignProofShare. Don't regress.
      const prior = await Designs.get(params.id)
      // Twenty stores status as STATUS_CLIENT_REVIEW etc. — normalize both
      // sides to dashboard vocabulary ("client_review") before comparing, and
      // translate back to Twenty's STATUS_ prefix before writing.
      const priorStatusDashboard = (prior?.status || '').toString().replace(/^STATUS_/i, '').toLowerCase()
      const transitioningToClientReview =
        body.status === 'client_review' && priorStatusDashboard !== 'client_review'
      const normalizedNextStatus = ALLOWED_STATUSES.has(body.status) ? body.status : null

      const patch: Record<string, unknown> = {}
      if ('job_title' in body) patch.name = body.job_title?.trim() || null
      if ('notes' in body) patch.aiPrompt = body.notes?.trim() || null
      if ('boards_requested' in body) patch.boardSection = body.boards_requested?.trim() || null
      if ('ftp_proof_link' in body) patch.proofLink = body.ftp_proof_link?.trim() || null
      if ('final_file_name' in body) patch.localFilePath = body.final_file_name?.trim() || null
      if ('status' in body && ALLOWED_STATUSES.has(body.status)) {
        patch.status = `STATUS_${String(body.status).toUpperCase()}`
      }
      const updated = await Designs.update(params.id, patch)

      // History: record a status transition when the normalized status moved.
      if (normalizedNextStatus && normalizedNextStatus !== priorStatusDashboard) {
        await logDesignActivity({
          designRequestId: params.id,
          eventType: 'status_change',
          actor: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
          fromValue: priorStatusDashboard || null,
          toValue: normalizedNextStatus,
        })
      }

      // QC sign-off: the In QC checkbox sends { status: 'client_review', qc_approved: true }.
      // The sign-off columns live on the local design_requests row in both modes.
      if (body.qc_approved === true) {
        try {
          await query(
            `UPDATE design_requests
             SET qc_approved_by_name = $1, qc_approved_by_email = $2, qc_approved_at = NOW(), updated_at = NOW()
             WHERE id::text = $3`,
            [auth.fullName || null, auth.email || null, params.id],
          )
        } catch (err) {
          console.error('[design-requests PATCH twenty-backed] QC approval stamp failed:', err)
        }
        await logDesignActivity({
          designRequestId: params.id,
          eventType: 'qc_approved' as DesignActivityType,
          actor: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
          detail: {},
        })
      }

      // Tri-code side table (Twenty has no native field on designRequests).
      if ('tricode' in body) {
        await upsertTriCode('design_request_tricodes', params.id, body.tricode)
      }

      if ((body.status === 'done' || body.status === 'approved') && priorStatusDashboard !== body.status) {
        const designerId = (updated as any).designAssigneeId || (prior as any)?.designAssigneeId
        const designerName = (updated as any).designAssignee
          ? `${(updated as any).designAssignee.name?.firstName || ''} ${(updated as any).designAssignee.name?.lastName || ''}`.trim()
          : ''
        if (designerId && designerName) {
          awardPointsOnce(designerId, designerName, 'DESIGN_COMPLETED', `design:${params.id}:completed`, { design_request_id: params.id, job_title: (updated as any).name || (prior as any)?.name || params.id }).catch(() => {})
        }
      }

      let proofShare: { token: string; url: string; emailed: boolean; client_email: string | null } | null = null
      if (transitioningToClientReview) {
        try {
          proofShare = await createDesignProofShare({
            designRequestId: params.id,
            createdByName: auth.fullName || null,
            createdByEmail: auth.email || null,
          })
          // Keep proofLink denormalised on Twenty so anyone reading the Twenty
          // record directly (Jireh via CRM) sees the same URL clients received.
          if (proofShare?.url) {
            try { await Designs.update(params.id, { proofLink: proofShare.url, proofSentAt: new Date().toISOString() }) } catch {}
          }
          if (proofShare?.token) {
            await logDesignActivity({
              designRequestId: params.id,
              eventType: 'proof_sent',
              actor: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
              detail: {
                emailed: proofShare.emailed,
                clientEmail: proofShare.client_email,
              },
            })
          }
        } catch (err) {
          console.error('[design-requests PATCH twenty-backed] proof share creation failed:', err)
        }
      }

      const notificationSummary = normalizedNextStatus && normalizedNextStatus !== priorStatusDashboard
        ? await notifyAssigneesOfStatusChange({
            kind: 'Design Request',
            recordId: params.id,
            title: (updated as any).name || (prior as any)?.name || params.id,
            previousStatus: priorStatusDashboard || null,
            status: normalizedNextStatus,
            path: `/designs/${params.id}`,
            assigneeIds: await getDesignRequestAssigneeIds(params.id, [
              (updated as any).designAssigneeId,
              (prior as any)?.designAssigneeId,
            ]),
          })
        : { target_count: 0, sent_count: 0, skipped_count: 0 }

      return NextResponse.json({
        // Normalize Twenty's STATUS_* back to dashboard vocab so the
        // kanban's optimistic setState doesn't flash a wrong-lane card.
        design_request: {
          id: updated.id,
          job_title: updated.name,
          status: ((updated.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
        },
        proof_share: proofShare,
        assignee_notifications: notificationSummary,
      })
    }

    const access = await getAccessibleRecord(request, params.id, 'technician')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
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

    // Tri-code drives the venue link — re-derive venue_id when a tri-code is set
    // and no explicit venue_id was provided (backward-compatible).
    if (body.tricode !== undefined && body.venue_id === undefined && body.tricode) {
      const resolvedVenueId = await resolveVenueIdFromTriCode(body.tricode)
      if (resolvedVenueId) {
        updates.push(`venue_id = $${index++}`)
        values.push(resolvedVenueId)
      }
    }

    // QC sign-off: the In QC checkbox sends { status: 'client_review', qc_approved: true }.
    // Stamp who approved and when from the authenticated actor.
    const qcApproving = body.qc_approved === true
    if (qcApproving) {
      updates.push(`qc_approved_by_name = $${index++}`)
      values.push(access.auth.fullName || null)
      updates.push(`qc_approved_by_email = $${index++}`)
      values.push(access.auth.email || null)
      updates.push(`qc_approved_at = NOW()`)
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const transitioningToClientReview =
      body.status === 'client_review' && access.record.status !== 'client_review'
    const normalizedNextStatus = ALLOWED_STATUSES.has(body.status) ? body.status : null

    const previousThresholdState = getBudgetThresholdState(access.record.hours_spent, access.record.hours_estimated)
    const nextHoursSpent = body.hours_spent !== undefined ? normalizeValue('hours_spent', body.hours_spent) : access.record.hours_spent
    const nextHoursEstimated = body.hours_estimated !== undefined ? normalizeValue('hours_estimated', body.hours_estimated) : access.record.hours_estimated
    const nextThresholdState = getBudgetThresholdState(nextHoursSpent, nextHoursEstimated)

    if (!previousThresholdState && nextThresholdState) {
      // TODO(ahmad): fire 75%-of-budget Slack alert
    }

    values.push(params.id)
    const result = await query(
      `UPDATE design_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, job_title, status, ftp_proof_link, updated_at`,
      values,
    )

    // History: record status transitions and reschedules on the local path.
    if (normalizedNextStatus && normalizedNextStatus !== access.record.status) {
      await logDesignActivity({
        designRequestId: params.id,
        eventType: 'status_change',
        actor: { userId: access.auth.userId, fullName: access.auth.fullName, email: access.auth.email },
        fromValue: access.record.status || null,
        toValue: normalizedNextStatus,
      })
    }
    if (qcApproving) {
      await logDesignActivity({
        designRequestId: params.id,
        eventType: 'qc_approved' as DesignActivityType,
        actor: { userId: access.auth.userId, fullName: access.auth.fullName, email: access.auth.email },
        detail: {},
      })
    }

    // Email newly-assigned staff (fire-and-forget — never blocks the response).
    const nextDesignerId = body.designer_id !== undefined ? (body.designer_id || null) : undefined
    const nextEnterpriseContactId = body.enterprise_contact_id !== undefined ? (body.enterprise_contact_id || null) : undefined
    const newlyAssignedIds = [
      nextDesignerId && nextDesignerId !== access.record.designer_id ? nextDesignerId : null,
      nextEnterpriseContactId && nextEnterpriseContactId !== access.record.enterprise_contact_id ? nextEnterpriseContactId : null,
    ].filter((id): id is string => typeof id === 'string')
    if (newlyAssignedIds.length) {
      sendAssignmentEmail({
        kind: 'design',
        recordId: params.id,
        recordTitle: access.record.job_title,
        client: access.record.company_name || access.record.venue_name || null,
        dueDate: body.due_date !== undefined ? body.due_date || null : access.record.due_date,
        assigneeUserIds: newlyAssignedIds,
        assignedByName: access.auth.fullName,
        assignedByUserId: access.auth.userId,
        assignedByEmail: access.auth.email,
      }).catch((err) => console.error('[design-requests PATCH] assignment email failed:', err))
    }
    if ('due_date' in body) {
      const nextDue = normalizeValue('due_date', body.due_date)
      const priorDue = access.record.due_date ? String(access.record.due_date).slice(0, 10) : null
      const nextDueStr = nextDue ? String(nextDue).slice(0, 10) : null
      if (nextDueStr !== priorDue) {
        await logDesignActivity({
          designRequestId: params.id,
          eventType: 'rescheduled',
          actor: { userId: access.auth.userId, fullName: access.auth.fullName, email: access.auth.email },
          fromValue: priorDue,
          toValue: nextDueStr,
        })
      }
    }

    // Gamification: award points once when design work reaches approved/done.
    if ((body.status === 'done' || body.status === 'approved') && access.record.status !== body.status) {
      const designerId = access.record.designer_id
      if (designerId) {
        const dStaff = await query('SELECT full_name FROM staff WHERE id = $1', [designerId])
        const designerName = dStaff.rows[0]?.full_name
        if (designerName) {
          awardPointsOnce(designerId, designerName, 'DESIGN_COMPLETED', `design:${params.id}:completed`, { design_request_id: params.id, job_title: access.record.job_title }).catch(() => {})
          const spent = Number(nextHoursSpent || 0)
          const estimated = Number(nextHoursEstimated || 0)
          if (estimated > 0 && spent <= estimated) {
            awardPointsOnce(designerId, designerName, 'DESIGN_UNDER_BUDGET', `design:${params.id}:under-budget`, { design_request_id: params.id, hours_spent: spent, hours_estimated: estimated }).catch(() => {})
          }
        }
      }
    }

    // When a designer moves the card into Client Review, auto-mint a public
    // proof link and email the client. Idempotent: if a live share already
    // exists for this record we reuse it, so dragging back and forth doesn't
    // spam the client.
    let proofShare: { token: string; url: string; emailed: boolean; client_email: string | null } | null = null
    if (transitioningToClientReview) {
      try {
        proofShare = await createDesignProofShare({
          designRequestId: params.id,
          createdByName: access.auth.fullName || null,
          createdByEmail: access.auth.email || null,
        })
        // Keep the denormalized ftp_proof_link field in sync with the client
        // review URL. Uploads may temporarily place an internal download URL
        // here; the Client Review transition should always replace it with
        // the public proof-share link.
        await query(
          `UPDATE design_requests
           SET legacy_ftp_proof_link = COALESCE(
                 legacy_ftp_proof_link,
                 CASE
                   WHEN ftp_proof_link IS NOT NULL
                    AND ftp_proof_link !~ '/proof/[A-Za-z0-9_-]+/?$'
                   THEN ftp_proof_link
                   ELSE NULL
                 END
               ),
               ftp_proof_link = $1
           WHERE id = $2`,
          [proofShare.url, params.id]
        )
        if (proofShare?.token) {
          await logDesignActivity({
            designRequestId: params.id,
            eventType: 'proof_sent',
            actor: { userId: access.auth.userId, fullName: access.auth.fullName, email: access.auth.email },
            detail: { emailed: proofShare.emailed, clientEmail: proofShare.client_email },
          })
        }
      } catch (err) {
        console.error('Proof share creation failed:', err)
      }
    }

    const notificationSummary = normalizedNextStatus && normalizedNextStatus !== access.record.status
      ? await notifyAssigneesOfStatusChange({
          kind: 'Design Request',
          recordId: params.id,
          title: access.record.job_title,
          previousStatus: access.record.status,
          status: normalizedNextStatus,
          path: `/designs/${params.id}`,
          assigneeIds: await getDesignRequestAssigneeIds(params.id),
        })
      : { target_count: 0, sent_count: 0, skipped_count: 0 }

    return NextResponse.json({ design_request: result.rows[0], proof_share: proofShare, assignee_notifications: notificationSummary })
  } catch (err) {
    console.error('Error updating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const auth = await requireRole(request, 'admin')
      if (isAuthError(auth)) return auth
      // Twenty's REST DELETE is a soft-delete: it stamps deletedAt and the
      // record drops out of all default (non-withDeleted) queries — recoverable.
      await Designs.delete(params.id)
      return NextResponse.json({ success: true })
    }

    const access = await getAccessibleRecord(request, params.id, 'admin')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }

    // Soft-delete: stamp deleted_at so the row disappears from every view but
    // stays recoverable. GET queries already filter deleted_at IS NULL.
    await query('UPDATE design_requests SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
