import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { createDesignProofShare } from '@/lib/design-proof'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

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
])

const ALLOWED_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'in_qc',
  'client_review',
  'approved',
  'done',
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
            dr.ftp_proof_link, dr.ftp_final_link, dr.final_file_name, dr.final_duration,
            dr.notes, dr.boards_requested, dr.sizes_requested, dr.designer_id,
            dr.enterprise_contact_id, dr.status, dr.hours_estimated, dr.hours_spent,
            dr.due_date, dr.created_at, dr.updated_at,
            v.name as venue_name,
            d.full_name as designer_name,
            ec.full_name as enterprise_contact_name
     FROM design_requests dr
     LEFT JOIN venues v ON dr.venue_id = v.id
     LEFT JOIN staff d ON dr.designer_id = d.id
     LEFT JOIN staff ec ON dr.enterprise_contact_id = ec.id
     WHERE dr.id = $1 ${vf.clause}`,
    params,
  )

  return { auth, record: result.rows[0] || null }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const auth = await requireRole(request, 'technician')
      if (isAuthError(auth)) return auth
      const d = await Designs.get(params.id) as any
      if (!d) return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      // Normalize Twenty's STATUS_DONE etc. back to dashboard vocab so the
      // new stage timeline UI can highlight the correct stage.
      const status = ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted'
      const notesText = typeof d.notes === 'object'
        ? (d.notes?.markdown || d.notes?.blocknote || '')
        : (d.notes || d.aiPrompt || '')
      const companyName = d.designClient?.name || null
      return NextResponse.json({
        design_request: {
          id: d.id,
          job_title: d.name,
          company_name: companyName,
          // Designs don't have a venue relation in Twenty — fall back to client
          // so the header + sidebar don't read "No client / No venue".
          venue_name: companyName,
          venue_id: null,
          tricode: d.clientTriCode || null,
          status,
          notes: notesText,
          ai_prompt: d.aiPrompt || null,
          boards_requested: d.boardSection || null,
          sizes_requested: d.sizes || null,
          ftp_proof_link: d.proofShareUrl || d.proofLink || d.ftpProofLink || null,
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
        } catch (err) {
          console.error('[design-requests PATCH twenty-backed] proof share creation failed:', err)
        }
      }

      return NextResponse.json({
        design_request: { id: updated.id, job_title: updated.name, status: updated.status },
        proof_share: proofShare,
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

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const transitioningToClientReview =
      body.status === 'client_review' && access.record.status !== 'client_review'

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
        // Keep the denormalized ftp_proof_link field in sync so the detail
        // page shows the generated URL immediately without a refetch.
        await query(
          `UPDATE design_requests SET ftp_proof_link = $1 WHERE id = $2 AND (ftp_proof_link IS NULL OR ftp_proof_link = '')`,
          [proofShare.url, params.id]
        )
      } catch (err) {
        console.error('Proof share creation failed:', err)
      }
    }

    return NextResponse.json({ design_request: result.rows[0], proof_share: proofShare })
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
      await Designs.delete(params.id)
      return NextResponse.json({ success: true })
    }

    const access = await getAccessibleRecord(request, params.id, 'admin')
    if (access instanceof NextResponse) return access
    if (!access.record) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }

    await query('DELETE FROM design_requests WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
