export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// POST /api/transparency/inbox/:id
// Admin-only. One of five actions:
//   { action: 'approve', hours?: number, bucket?: 'service_contract'|'warranty'|'change_order'|'not_billable' }
//     → flips bucket_confirmed = true, promotes hours into actual_hours
//     → if bucket is service_contract: retainer_covered = true, classification = 'FIX' (unless overridden)
//     → if bucket is not_billable: retainer_covered = false, row stays in ledger but never counts
//   { action: 'skip' }
//     → soft-cancel: status='cancelled' so the row never appears on /transparency
//   { action: 'edit', hours?: number, actual_hours?: number, bucket?: ..., classification?: ..., summary?: string }
//     → adjusts values; if row is already bucket_confirmed, updates actual_hours so the
//       meter reflects the change immediately
//   { action: 'unapprove' }
//     → flips bucket_confirmed = false so the row returns to the pending inbox
//   { action: 'delete' }
//     → hard DELETE the row from the ledger (irreversible — use skip for soft-cancel)
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '').toLowerCase()

  if (!['approve', 'skip', 'edit', 'unapprove', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve|skip|edit|unapprove|delete' }, { status: 400 })
  }

  const validBuckets = ['service_contract', 'warranty', 'change_order', 'not_billable']
  const bucket = body.bucket && validBuckets.includes(body.bucket) ? String(body.bucket) : null
  const validClassifications = ['FIX', 'NEW', 'MIXED']
  const classification =
    body.classification && validClassifications.includes(String(body.classification).toUpperCase())
      ? String(body.classification).toUpperCase()
      : null
  const hours = Number.isFinite(Number(body.hours)) ? Number(body.hours) : null
  const actualHours = Number.isFinite(Number(body.actual_hours)) ? Number(body.actual_hours) : null
  const summary = typeof body.summary === 'string' && body.summary.trim() ? String(body.summary).trim() : null

  try {
    if (action === 'delete') {
      await query(`DELETE FROM service_requests WHERE id = $1`, [id])
      return NextResponse.json({ deleted: true })
    }
    if (action === 'unapprove') {
      await query(
        `UPDATE service_requests
            SET bucket_confirmed = false,
                actual_hours = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [id],
      )
    } else if (action === 'skip') {
      await query(
        `UPDATE service_requests
            SET status = 'cancelled', bucket_confirmed = true, updated_at = NOW()
          WHERE id = $1`,
        [id],
      )
    } else if (action === 'edit') {
      const sets: string[] = []
      const params: unknown[] = [id]
      if (hours != null && hours >= 0) {
        params.push(hours)
        sets.push(`estimated_hours = $${params.length}`)
      }
      if (actualHours != null && actualHours >= 0) {
        params.push(actualHours)
        sets.push(`actual_hours = $${params.length}`)
      }
      if (bucket) {
        params.push(bucket)
        sets.push(`bucket = $${params.length}`)
        params.push(bucket === 'service_contract')
        sets.push(`retainer_covered = $${params.length}`)
      }
      if (classification) {
        params.push(classification)
        sets.push(`classification = $${params.length}`)
      }
      if (summary) {
        params.push(summary)
        sets.push(`summary = $${params.length}`)
      }
      if (sets.length === 0) {
        return NextResponse.json({ error: 'nothing to edit' }, { status: 400 })
      }
      sets.push(`updated_at = NOW()`)
      await query(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = $1`, params)
    } else {
      // approve
      const finalBucket = bucket || 'service_contract'
      const finalClassification =
        classification || (finalBucket === 'change_order' ? 'NEW' : 'FIX')
      const finalRetainerCovered = finalBucket === 'service_contract'
      // If hours wasn't provided, promote the existing estimated_hours into
      // actual_hours (the deterministic priors-derived value). That's the
      // whole point of the inbox flow — Ahmad just clicks approve, no typing.
      await query(
        `UPDATE service_requests
            SET bucket = $2,
                bucket_confirmed = true,
                classification = $3,
                retainer_covered = $4,
                actual_hours = CASE
                  WHEN $5::numeric IS NOT NULL THEN $5::numeric
                  WHEN $6::boolean THEN COALESCE(actual_hours, estimated_hours)
                  ELSE actual_hours
                END,
                updated_at = NOW()
          WHERE id = $1`,
        [
          id,
          finalBucket,
          finalClassification,
          finalRetainerCovered,
          hours,
          finalBucket !== 'not_billable',
        ],
      )
    }

    const r = await query(`SELECT * FROM service_requests WHERE id = $1`, [id])
    return NextResponse.json(r.rows[0])
  } catch (err) {
    console.error('[transparency/inbox] error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'inbox update failed' },
      { status: 500 },
    )
  }
}
