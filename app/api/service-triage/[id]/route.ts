export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { markStarted, markShipped, markQuoted, markApproved, markPaid, revertStage } from '@/lib/service-triage'

// GET /api/service-triage/:id — single request detail
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  const r = await query(`SELECT * FROM service_requests WHERE id = $1`, [id])
  if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(r.rows[0])
}

// PATCH /api/service-triage/:id
// Body: one of:
//   { action: 'start' }
//   { action: 'ship', actual_hours: 1.5, shipped_commit_sha?: 'abc1234', notes?: '...' }
//   { action: 'quote', quote_amount?: 2400, notes?: '...' }
//   { action: 'reclassify', classification: 'FIX'|'NEW'|'MIXED', retainer_covered?: bool }
//   { action: 'update', estimated_hours?: number, notes?: string, repo?: string, area?: string }
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '').toLowerCase()

  try {
    switch (action) {
      case 'start':
        await markStarted(id)
        break
      case 'ship': {
        const actual_hours = Number(body.actual_hours)
        if (!Number.isFinite(actual_hours) || actual_hours < 0) {
          return NextResponse.json({ error: 'actual_hours must be a non-negative number' }, { status: 400 })
        }
        await markShipped(id, {
          actual_hours,
          shipped_commit_sha: typeof body.shipped_commit_sha === 'string' ? body.shipped_commit_sha : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        })
        break
      }
      case 'quote':
        await markQuoted(id, {
          quote_amount: typeof body.quote_amount === 'number' ? body.quote_amount : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        })
        break
      case 'approve':
        await markApproved(id)
        break
      case 'mark_paid':
      case 'pay':
        await markPaid(id, {
          paid_amount: typeof body.paid_amount === 'number' ? body.paid_amount : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        })
        break
      case 'revert':
      case 'revert_stage':
        await revertStage(id)
        break
      case 'inbox_approve':
        // Promote a captured candidate to a real request — it now appears on
        // boards, counts toward retainer math (if FIX), and runs alerts.
        await query(`UPDATE service_requests SET inbox = false, updated_at = NOW() WHERE id = $1`, [id])
        break
      case 'inbox_reject':
        // Cancel without ever surfacing on a board.
        await query(`UPDATE service_requests SET inbox = false, status = 'cancelled', updated_at = NOW() WHERE id = $1`, [id])
        break
      case 'reclassify': {
        const cls = String(body.classification || '').toUpperCase()
        if (!['FIX', 'NEW', 'MIXED'].includes(cls)) {
          return NextResponse.json({ error: 'classification must be FIX|NEW|MIXED' }, { status: 400 })
        }
        const retainer_covered = typeof body.retainer_covered === 'boolean' ? body.retainer_covered : cls === 'FIX'
        await query(
          `UPDATE service_requests SET classification = $2, retainer_covered = $3, updated_at = NOW() WHERE id = $1`,
          [id, cls, retainer_covered],
        )
        break
      }
      case 'update': {
        const sets: string[] = []
        const params: any[] = [id]
        if (body.estimated_hours !== undefined) { params.push(Number(body.estimated_hours)); sets.push(`estimated_hours = $${params.length}`) }
        if (typeof body.notes === 'string') { params.push(body.notes); sets.push(`notes = $${params.length}`) }
        if (typeof body.repo === 'string') { params.push(body.repo); sets.push(`repo = $${params.length}`) }
        if (typeof body.area === 'string') { params.push(body.area); sets.push(`area = $${params.length}`) }
        if (typeof body.summary === 'string') { params.push(body.summary); sets.push(`summary = $${params.length}`) }
        if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
        sets.push(`updated_at = NOW()`)
        await query(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = $1`, params)
        break
      }
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
    }

    const r = await query(`SELECT * FROM service_requests WHERE id = $1`, [id])
    return NextResponse.json(r.rows[0])
  } catch (err) {
    console.error('[service-triage PATCH] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'update failed' }, { status: 500 })
  }
}

// DELETE /api/service-triage/:id — soft cancel (status='cancelled')
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  await query(`UPDATE service_requests SET status='cancelled', updated_at=NOW() WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
