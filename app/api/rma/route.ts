import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
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
