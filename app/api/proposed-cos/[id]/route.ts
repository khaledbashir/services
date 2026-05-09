export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { deriveProject } from '@/lib/service-triage'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  const r = await query(`SELECT * FROM proposed_change_orders WHERE id = $1`, [id])
  if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(r.rows[0])
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))

  const sets: string[] = []
  const params: unknown[] = [id]
  const push = (field: string, value: unknown) => {
    params.push(value)
    sets.push(`${field} = $${params.length}`)
  }

  if (typeof body.name === 'string') push('name', body.name)
  if (typeof body.pitch === 'string') push('pitch', body.pitch)
  if (Array.isArray(body.bullets)) push('bullets', body.bullets.map((b: unknown) => String(b)))
  if (body.price_usd === null || Number.isFinite(Number(body.price_usd))) {
    push('price_usd', body.price_usd === null ? null : Number(body.price_usd))
  }
  if (typeof body.timeline_label === 'string') push('timeline_label', body.timeline_label)
  if (typeof body.benefit === 'string') push('benefit', body.benefit)
  if (['bundle', 'individual'].includes(String(body.category))) push('category', String(body.category))
  if (typeof body.target_project === 'string') push('target_project', body.target_project)
  if (['draft', 'available', 'pitched', 'in_progress', 'won', 'archived'].includes(String(body.status))) {
    push('status', String(body.status))
  }
  if (Array.isArray(body.pitched_to)) push('pitched_to', body.pitched_to.map((p: unknown) => String(p)))
  if (typeof body.is_placeholder === 'boolean') push('is_placeholder', body.is_placeholder)
  if (Number.isFinite(Number(body.sort_order))) push('sort_order', Number(body.sort_order))
  if (typeof body.notes === 'string') push('notes', body.notes)

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  sets.push('updated_at = NOW()')
  await query(`UPDATE proposed_change_orders SET ${sets.join(', ')} WHERE id = $1`, params)
  const r = await query(`SELECT * FROM proposed_change_orders WHERE id = $1`, [id])
  return NextResponse.json(r.rows[0])
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  await query(`UPDATE proposed_change_orders SET status='archived', updated_at=NOW() WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/proposed-cos/[id]/promote — promote a proposed CO into a real
 * change order on the kanban. Creates a service_requests row from the
 * catalog card (status='quoted' since the price is pre-baked) and links
 * the catalog row to it via promoted_request_id.
 *
 * Body: { requester?: string }
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const requester = typeof body.requester === 'string' ? body.requester : null

  const proposedRes = await query(`SELECT * FROM proposed_change_orders WHERE id = $1`, [id])
  if (proposedRes.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const p = proposedRes.rows[0]

  const project = p.target_project || deriveProject({ repo: null, area: null, source: 'manual', text: p.name })
  const summary = `${p.name}${p.pitch ? ' — ' + p.pitch : ''}`.slice(0, 200)
  const rawText = [
    `Proposed CO promoted from catalog: ${p.name}`,
    p.pitch ? `\nPitch: ${p.pitch}` : '',
    p.bullets?.length ? `\n\nCapabilities:\n` + p.bullets.map((b: string) => `- ${b}`).join('\n') : '',
    p.benefit ? `\n\nBenefit: ${p.benefit}` : '',
    p.timeline_label ? `\n\nTimeline: ${p.timeline_label}` : '',
  ].join('')

  const newRow = await query(
    `INSERT INTO service_requests
       (source, raw_text, summary, classification, classification_basis,
        repo, area, project, retainer_covered, status,
        estimated_usd, quote_amount, requester, notes)
     VALUES ('manual', $1, $2, 'NEW', 'promoted from proposed-COs catalog',
             NULL, NULL, $3, false, 'quoted',
             $4::numeric, $4::numeric, $5, $6)
     RETURNING id`,
    [rawText, summary, project, p.price_usd, requester, p.notes],
  )
  const newId = newRow.rows[0].id

  await query(
    `UPDATE proposed_change_orders SET status='won', promoted_request_id=$2, updated_at=NOW() WHERE id = $1`,
    [id, newId],
  )

  return NextResponse.json({ ok: true, request_id: newId })
}
