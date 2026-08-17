import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Rma, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { awardPointsOnce } from '@/lib/gamification'
import { returnRmaToStock, isReturnedToStockStatus } from '@/lib/inventory-alerts'

const EDITABLE = ['venue_id','company_name','client_name','submission_contact','date_received',
  'project_code','part_number','part_name','model_number','led_manufacturer','description',
  'quantities','repair_vendor','shipping_method','shipment_tracking','parts_details',
  'remit_to_stock','status','notes']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const body = await request.json()

  if (isTwentyBackedEnabled('RMA')) {
    try {
      const patch: Record<string, unknown> = {}
      if ('part_number' in body) patch.partNumber = body.part_number
      if ('model_number' in body) patch.modelNumber = body.model_number
      if ('parts_details' in body) patch.partsDetails = body.parts_details
      if ('description' in body && !body.parts_details) patch.partsDetails = body.description
      if ('client_name' in body) patch.clientName = body.client_name
      if ('submission_contact' in body) patch.submissionContact = body.submission_contact
      if ('remit_to_stock' in body) patch.remitToStock = Boolean(body.remit_to_stock)
      const updated = await Rma.update(params.id, patch)

      // Gamification: award points once when RMA is closed (Twenty-backed)
      if (body.status === 'closed' || body.status === 'completed') {
        const submitter = (updated as any).submissionContact || body.submission_contact
        if (submitter) {
          const staffRes = await query('SELECT id, full_name FROM staff WHERE full_name = $1', [submitter])
          if (staffRes.rows[0]) {
            awardPointsOnce(staffRes.rows[0].id, staffRes.rows[0].full_name, 'RMA_CLOSED', `rma:${params.id}:twenty`, { rma_id: params.id }).catch(() => {})
          }
        }
      }

      return NextResponse.json({ rma: { id: updated.id, ...body } })
    } catch (err) {
      console.error('[rma PATCH twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to update RMA in Twenty' }, { status: 500 })
    }
  }

  const previous = await query('SELECT status FROM rma_trackers WHERE id = $1', [params.id])
  const previousStatus = previous.rows[0]?.status || null

  const sets: string[] = []
  const values: unknown[] = []
  for (const k of EDITABLE) {
    if (k in body) { values.push(body[k]); sets.push(`${k} = $${values.length}`) }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  values.push(params.id)
  const r = await query(`UPDATE rma_trackers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values)

  // Joe 2026-08-17: "Can these be connected to RMA tracking?" — a repaired
  // part marked remit-to-stock credits the venue's inventory the moment the
  // RMA reaches a returned state. Stamped on the RMA, so re-saving the record
  // cannot credit the same part twice.
  const updatedRma = r.rows[0]
  let stockReturn: Awaited<ReturnType<typeof returnRmaToStock>> | null = null
  if (updatedRma?.remit_to_stock && isReturnedToStockStatus(updatedRma.status) && !updatedRma.stock_returned_at) {
    try {
      stockReturn = await returnRmaToStock(params.id)
    } catch (stockErr) {
      console.error('[rma] failed to return part to stock:', stockErr)
    }
  }

  // Gamification: award points once when RMA is closed
  if ((body.status === 'closed' || body.status === 'completed') && previousStatus !== body.status) {
    const submitter = r.rows[0]?.submission_contact
    if (submitter) {
      const staffRes = await query('SELECT id, full_name FROM staff WHERE full_name = $1', [submitter])
      if (staffRes.rows[0]) {
        awardPointsOnce(staffRes.rows[0].id, staffRes.rows[0].full_name, 'RMA_CLOSED', `rma:${params.id}`, { rma_id: params.id }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ rma: r.rows[0], stock_return: stockReturn })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('RMA')) {
    try {
      await Rma.delete(params.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[rma DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete RMA in Twenty' }, { status: 500 })
    }
  }

  await query(`DELETE FROM rma_trackers WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
