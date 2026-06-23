export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { PrintRequests, fetchAllTwenty, isTwentyBackedEnabled, type TwentyPrintRequest } from '@/lib/twenty-ops'
import { resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { isSpecSheetWork, SPEC_SHEET_PRINT_SQL_WITH_ALIAS } from '@/lib/spec-sheet-work'

type TwentyCompany = { id: string; name: string }

const DASHBOARD_TO_TWENTY_STATUS: Record<string, string> = {
  new_job: 'STATUS_NEW_JOB',
  awaiting_layout: 'STATUS_WAITING_LAYOUT',
  awaiting_approval: 'STATUS_AWAITING_APPROVAL',
  approved: 'STATUS_APPROVED',
  in_production: 'STATUS_IN_PRODUCTION',
  shipped: 'STATUS_SHIPPED',
  invoiced: 'STATUS_INVOICED',
}

const TWENTY_TO_DASHBOARD_STATUS = Object.fromEntries(
  Object.entries(DASHBOARD_TO_TWENTY_STATUS).map(([dashboard, twenty]) => [twenty, dashboard]),
) as Record<string, string>

let companyCache:
  | { expiresAt: number; byExactName: Map<string, TwentyCompany>; byLowerName: Map<string, TwentyCompany> }
  | null = null

async function getTwentyCompanyIndex() {
  const now = Date.now()
  if (companyCache && companyCache.expiresAt > now) return companyCache

  const companies = await fetchAllTwenty<TwentyCompany>('companies')
  const byExactName = new Map<string, TwentyCompany>()
  const byLowerName = new Map<string, TwentyCompany>()
  for (const company of companies) {
    byExactName.set(company.name, company)
    byLowerName.set(company.name.toLowerCase(), company)
  }

  companyCache = {
    expiresAt: now + 60_000,
    byExactName,
    byLowerName,
  }
  return companyCache
}

function normalizeStatus(status: string | null | undefined): string {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return 'new_job'
  if (raw === 'new_request') return 'new_job'
  if (raw in DASHBOARD_TO_TWENTY_STATUS) return raw
  if (status && status in TWENTY_TO_DASHBOARD_STATUS) return TWENTY_TO_DASHBOARD_STATUS[status]
  return 'new_job'
}

function toTwentyStatus(status: string | null | undefined): string {
  return DASHBOARD_TO_TWENTY_STATUS[normalizeStatus(status)] || DASHBOARD_TO_TWENTY_STATUS.new_job
}

function parseProofLinks(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {}

  return trimmed
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeInvoiceAmount(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function getClientNameFromLocalId(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null
  const result = await query('SELECT name FROM clients WHERE id = $1 LIMIT 1', [clientId])
  return result.rows[0]?.name || null
}

async function findLocalClientIdByName(clientName: string | null | undefined): Promise<string | null> {
  if (!clientName) return null
  const result = await query('SELECT id FROM clients WHERE LOWER(name) = LOWER($1) ORDER BY name ASC LIMIT 1', [clientName])
  return result.rows[0]?.id || null
}

async function resolveTwentyCompanyId(clientId: string | null | undefined, clientName: string | null | undefined): Promise<string | null> {
  const resolvedName = clientName?.trim() || (await getClientNameFromLocalId(clientId)) || null
  if (!resolvedName) return null

  const index = await getTwentyCompanyIndex()
  return index.byExactName.get(resolvedName)?.id || index.byLowerName.get(resolvedName.toLowerCase())?.id || null
}

async function reshapeTwentyPrintRequest(record: TwentyPrintRequest) {
  const clientName = record.printClient?.name || null
  const proofLinks = parseProofLinks(record.proofLinks)
  return {
    id: record.id,
    venue_id: null,
    venue_name: null,
    client_id: await findLocalClientIdByName(clientName),
    client_name: clientName,
    print_client_id: record.printClientId || null,
    job_title: record.name || '(untitled)',
    status: normalizeStatus(record.status),
    shipping_address: record.shippingAddress || null,
    shipping_info: record.shippingAddress || null,
    ship_date: record.shipDate || null,
    arrival_date: record.arrivalDate || null,
    invoice_amount: record.invoiceAmount ?? null,
    britten_cost: record.invoiceAmount ?? null,
    notes: record.britainNotes || null,
    britain_notes: record.britainNotes || null,
    proof_links: proofLinks,
    proof_links_json: JSON.stringify(proofLinks),
    tracking_number: record.trackingNumber || null,
    assignee_id: null,
    assignee_name: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function legacyStatusForDb(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized === 'new_job' ? 'new_request' : normalized
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      const printRequest = await PrintRequests.get(params.id)
      if (!printRequest) return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
      if (isSpecSheetWork(printRequest.name, printRequest.printClient?.name, printRequest.britainNotes)) {
        return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
      }
      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(printRequest) })
    }

    const result = await query(
      `SELECT pr.id, pr.venue_id, v.name as venue_name, pr.client_name, pr.job_title, pr.notes,
              pr.shipping_info, pr.ship_date, pr.arrival_date, pr.britten_cost, pr.tracking_number,
              pr.status, pr.created_at, pr.updated_at
       FROM print_requests pr
       LEFT JOIN venues v ON v.id = pr.venue_id
       WHERE pr.id = $1
         AND NOT ${SPEC_SHEET_PRINT_SQL_WITH_ALIAS('pr')}`,
      [params.id],
    )

    const row = result.rows[0]
    if (!row) return NextResponse.json({ error: 'Print request not found' }, { status: 404 })

    return NextResponse.json({
      print_request: {
        id: row.id,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        client_id: await findLocalClientIdByName(row.client_name || null),
        client_name: row.client_name,
        print_client_id: null,
        job_title: row.job_title,
        status: normalizeStatus(row.status),
        shipping_address: row.shipping_info,
        shipping_info: row.shipping_info,
        ship_date: row.ship_date,
        arrival_date: row.arrival_date,
        invoice_amount: row.britten_cost,
        britten_cost: row.britten_cost,
        notes: row.notes,
        britain_notes: row.notes,
        proof_links: [],
        proof_links_json: '[]',
        tracking_number: row.tracking_number,
        assignee_id: null,
        assignee_name: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    })
  } catch (err) {
    console.error('Error fetching print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()

    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      const patch: Record<string, unknown> = {}
      if ('job_title' in body) patch.name = body.job_title?.trim() || null
      if ('status' in body) patch.status = toTwentyStatus(body.status)
      if ('client_id' in body || 'client_name' in body) {
        patch.printClientId = await resolveTwentyCompanyId(body.client_id || null, body.client_name || null)
      }
      if ('shipping_address' in body) patch.shippingAddress = body.shipping_address?.trim() || null
      if ('ship_date' in body) patch.shipDate = body.ship_date || null
      if ('arrival_date' in body) patch.arrivalDate = body.arrival_date || null
      if ('invoice_amount' in body) patch.invoiceAmount = normalizeInvoiceAmount(body.invoice_amount)
      if ('notes' in body) patch.britainNotes = body.notes?.trim() || null
      if ('proof_links' in body) patch.proofLinks = JSON.stringify(parseProofLinks(body.proof_links))
      if ('tracking_number' in body) patch.trackingNumber = body.tracking_number?.trim() || null

      const updated = await PrintRequests.update(params.id, patch)
      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(updated) })
    }

    const updates: string[] = []
    const values: unknown[] = []

    if ('client_id' in body || 'client_name' in body) {
      values.push(body.client_name?.trim() || (await getClientNameFromLocalId(body.client_id || null)) || null)
      updates.push(`client_name = $${values.length}`)
    }
    if ('venue_id' in body || 'venue_tricode' in body || 'tricode' in body) {
      values.push(body.venue_id || await resolveVenueIdFromTriCode(body.venue_tricode || body.tricode))
      updates.push(`venue_id = $${values.length}`)
    }
    if ('job_title' in body) {
      values.push(body.job_title?.trim() || null)
      updates.push(`job_title = $${values.length}`)
    }
    if ('notes' in body) {
      values.push(body.notes?.trim() || null)
      updates.push(`notes = $${values.length}`)
    }
    if ('shipping_address' in body) {
      values.push(body.shipping_address?.trim() || null)
      updates.push(`shipping_info = $${values.length}`)
    }
    if ('ship_date' in body) {
      values.push(body.ship_date || null)
      updates.push(`ship_date = $${values.length}`)
    }
    if ('arrival_date' in body) {
      values.push(body.arrival_date || null)
      updates.push(`arrival_date = $${values.length}`)
    }
    if ('invoice_amount' in body) {
      values.push(normalizeInvoiceAmount(body.invoice_amount))
      updates.push(`britten_cost = $${values.length}`)
    }
    if ('tracking_number' in body) {
      values.push(body.tracking_number?.trim() || null)
      updates.push(`tracking_number = $${values.length}`)
    }
    if ('status' in body) {
      values.push(legacyStatusForDb(body.status))
      updates.push(`status = $${values.length}`)
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(params.id)
    const result = await query(
      `UPDATE print_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date, britten_cost, tracking_number, status, created_at, updated_at`,
      values,
    )

    const row = result.rows[0]
    if (!row) return NextResponse.json({ error: 'Print request not found' }, { status: 404 })
    const venueName = row.venue_id
      ? (await query('SELECT name FROM venues WHERE id = $1 LIMIT 1', [row.venue_id])).rows[0]?.name || null
      : null

    return NextResponse.json({
      print_request: {
        id: row.id,
        venue_id: row.venue_id,
        venue_name: venueName,
        client_id: await findLocalClientIdByName(row.client_name || null),
        client_name: row.client_name,
        print_client_id: null,
        job_title: row.job_title,
        status: normalizeStatus(row.status),
        shipping_address: row.shipping_info,
        shipping_info: row.shipping_info,
        ship_date: row.ship_date,
        arrival_date: row.arrival_date,
        invoice_amount: row.britten_cost,
        britten_cost: row.britten_cost,
        notes: row.notes,
        britain_notes: row.notes,
        proof_links: [],
        proof_links_json: '[]',
        tracking_number: row.tracking_number,
        assignee_id: null,
        assignee_name: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    })
  } catch (err) {
    console.error('Error updating print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'tech_support')
    if (isAuthError(auth)) return auth

    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      await PrintRequests.delete(params.id)
      return NextResponse.json({ ok: true })
    }

    await query('DELETE FROM print_requests WHERE id = $1', [params.id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
