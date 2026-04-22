import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Rma, isTwentyBackedEnabled, type TwentyRmaTracker } from '@/lib/twenty-ops'

// Legacy response shape the /rma page consumes:
//   { rmas: [ { id, venue_id, venue_name, company_name, client_name,
//               date_received, project_code, part_number, part_name,
//               model_number, submission_contact, parts_details,
//               remit_to_stock, status, notes } ] }

function reshapeRma(r: TwentyRmaTracker) {
  return {
    id: r.id,
    venue_id: null,
    venue_name: r.rmaCompany?.name || '',
    company_name: r.rmaCompany?.name || null,
    client_name: r.clientName,
    date_received: r.createdAt,
    project_code: null,
    part_number: r.partNumber,
    part_name: null,
    model_number: r.modelNumber,
    submission_contact: r.submissionContact,
    parts_details: r.partsDetails,
    remit_to_stock: r.remitToStock || false,
    status: 'received',
    notes: null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('RMA')) {
    try {
      const items: any[] = []
      let cursor: string | null = null
      for (let p = 0; p < 10; p++) {
        const page = await Rma.list({
          limit: 60,
          startingAfter: cursor || undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const rma of page.items) items.push(reshapeRma(rma))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ rmas: items })
    } catch (err) {
      console.error('[rma GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list RMAs from Twenty' }, { status: 500 })
    }
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const params: unknown[] = []
  let where = ''
  if (status) { params.push(status); where = `WHERE r.status = $1` }

  const res = await query(
    `SELECT r.*, v.name AS venue_name
     FROM rma_trackers r
     LEFT JOIN venues v ON v.id = r.venue_id
     ${where} ORDER BY r.date_received DESC NULLS LAST, r.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ rmas: res.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  const {
    venue_id = null, company_name = null, client_name = null, submission_contact = null,
    date_received = null, project_code = null, part_number = null, part_name = null,
    model_number = null, led_manufacturer = null, description = null, quantities = null,
    repair_vendor = null, shipping_method = null, shipment_tracking = null,
    parts_details = null, remit_to_stock = false, status = 'received', notes = null,
  } = body

  if (isTwentyBackedEnabled('RMA')) {
    try {
      const created = await Rma.create({
        partNumber: part_number,
        modelNumber: model_number,
        partsDetails: parts_details || description,
        clientName: client_name,
        submissionContact: submission_contact,
        remitToStock: Boolean(remit_to_stock),
      })
      return NextResponse.json({ rma: { id: created.id, ...body } })
    } catch (err) {
      console.error('[rma POST twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to create RMA in Twenty' }, { status: 500 })
    }
  }

  const r = await query(
    `INSERT INTO rma_trackers (venue_id, company_name, client_name, submission_contact,
       date_received, project_code, part_number, part_name, model_number, led_manufacturer,
       description, quantities, repair_vendor, shipping_method, shipment_tracking, parts_details,
       remit_to_stock, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [venue_id, company_name, client_name, submission_contact, date_received, project_code,
     part_number, part_name, model_number, led_manufacturer, description, quantities,
     repair_vendor, shipping_method, shipment_tracking, parts_details, remit_to_stock, status, notes]
  )
  return NextResponse.json({ rma: r.rows[0] })
}
