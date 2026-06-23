export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { PrintRequests, fetchAllTwenty, isTwentyBackedEnabled, type TwentyPrintRequest } from '@/lib/twenty-ops'
import { resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { isSpecSheetWork, SPEC_SHEET_INTERNAL_CATEGORY, SPEC_SHEET_PRINT_SQL_WITH_ALIAS } from '@/lib/spec-sheet-work'

type ClientRow = { id: string; name: string }
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
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
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
  const result = await query('SELECT id, name FROM clients WHERE id = $1 LIMIT 1', [clientId])
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

// Twenty stores money fields as {amountMicros, currencyCode}. 1 dollar = 1_000_000 micros.
// Unpack defensively — the field may be a plain number, a populated currency object,
// or an empty {amountMicros: null} placeholder that must become null (not NaN).
function moneyToNumber(v: any): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object' && 'amountMicros' in v) {
    const micros = v.amountMicros
    if (micros === null || micros === undefined) return null
    const n = Number(micros)
    return Number.isFinite(n) ? n / 1_000_000 : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function reshapeTwentyPrintRequest(record: TwentyPrintRequest) {
  const raw = record as any
  const clientName = raw.printClient?.name || null
  const proofLinks = parseProofLinks(raw.proofLinks)
  const jobTitle = (raw.name && raw.name.trim()) || (raw.sfNumber && raw.sfNumber.trim()) || '(untitled)'
  const notesText = typeof raw.notes === 'object'
    ? (raw.notes?.markdown || raw.notes?.blocknote || '')
    : (raw.notes || '')
  return {
    id: record.id,
    client_id: await findLocalClientIdByName(clientName),
    client_name: clientName,
    print_client_id: raw.printClientId || null,
    job_title: jobTitle,
    status: normalizeStatus(raw.status),
    shipping_address: raw.shippingAddress || null,
    shipping_info: raw.shippingAddress || null,
    ship_date: raw.shipDate || null,
    arrival_date: raw.arrivalDate || null,
    due_date: raw.dueDate || null,
    invoice_amount: moneyToNumber(raw.invoiceAmount),
    britten_cost: moneyToNumber(raw.brittenPrice),
    anc_price: moneyToNumber(raw.ancPrice),
    install_fee: moneyToNumber(raw.installFee),
    rush_fee: moneyToNumber(raw.rushFee),
    shipping_fee: moneyToNumber(raw.shippingFee),
    sales_tax: moneyToNumber(raw.salesTax),
    notes: notesText || raw.britainNotes || null,
    britain_notes: raw.britainNotes || null,
    proof_links: proofLinks,
    proof_links_json: JSON.stringify(proofLinks),
    tracking_number: raw.trackingNumber || null,
    wrike_task_id: raw.wrikeTaskId || null,
    sf_number: raw.sfNumber || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

async function listTwentyPrintRequests(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const clientId = searchParams.get('client_id')
  const clientName = searchParams.get('client_name')
  const filters: string[] = []

  if (statusFilter && statusFilter !== 'all') {
    filters.push(`status[eq]:"${toTwentyStatus(statusFilter)}"`)
  }

  if (clientId || clientName) {
    const companyId = await resolveTwentyCompanyId(clientId, clientName)
    if (!companyId) return []
    filters.push(`printClientId[eq]:"${companyId}"`)
  }

  const items: ReturnType<typeof reshapeTwentyPrintRequest>[] = []
  let cursor: string | null = null

  for (let pageIndex = 0; pageIndex < 50; pageIndex++) {
    const page = await PrintRequests.list({
      limit: 60,
      startingAfter: cursor || undefined,
      filter: filters.length ? filters.join(',') : undefined,
      orderBy: 'updatedAt[DescNullsLast]',
    })

    for (const item of page.items) {
      if (!isSpecSheetWork(item.name, item.printClient?.name, item.britainNotes)) {
        items.push(reshapeTwentyPrintRequest(item))
      }
    }

    if (!page.hasNextPage || !page.nextCursor) break
    cursor = page.nextCursor
  }

  return Promise.all(items)
}

function legacyStatusForDb(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized === 'new_job' ? 'new_request' : normalized
}

async function listLegacyPrintRequests(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const clientId = searchParams.get('client_id')

  const conditions: string[] = [`NOT ${SPEC_SHEET_PRINT_SQL_WITH_ALIAS('pr')}`]
  const params: unknown[] = []

  if (statusFilter && statusFilter !== 'all') {
    params.push(legacyStatusForDb(statusFilter))
    conditions.push(`pr.status = $${params.length}`)
  }

  if (clientId) {
    const clientName = await getClientNameFromLocalId(clientId)
    if (!clientName) return []
    params.push(clientName)
    conditions.push(`LOWER(pr.client_name) = LOWER($${params.length})`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await query(
    `SELECT pr.id, pr.venue_id, v.name as venue_name, pr.client_name, pr.job_title, pr.notes, pr.shipping_info, pr.ship_date, pr.arrival_date,
            pr.britten_cost, pr.tracking_number, pr.status, pr.created_at, pr.updated_at
     FROM print_requests pr
     LEFT JOIN venues v ON v.id = pr.venue_id
     ${whereClause}
     ORDER BY pr.updated_at DESC, pr.created_at DESC`,
    params,
  )

  return Promise.all(
    result.rows.map(async (row) => ({
      id: row.id,
      client_id: await findLocalClientIdByName(row.client_name || null),
      client_name: row.client_name,
      print_client_id: null,
      venue_id: row.venue_id,
      venue_name: row.venue_name,
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
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  )
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      const printRequests = await listTwentyPrintRequests(request)
      return NextResponse.json({ print_requests: printRequests })
    }

    const printRequests = await listLegacyPrintRequests(request)
    return NextResponse.json({ print_requests: printRequests })
  } catch (err) {
    console.error('Error fetching print requests:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const jobTitle = String(body.job_title || '').trim()

    if (!jobTitle) {
      return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
    }

    const clientName = body.client_name?.trim() || (await getClientNameFromLocalId(body.client_id || null)) || null
    const resolvedVenueId = body.venue_id || await resolveVenueIdFromTriCode(body.venue_tricode || body.tricode)

    if (isSpecSheetWork(jobTitle, clientName, body.notes)) {
      const created = await query(
        `WITH inserted AS (
          INSERT INTO design_requests (
            venue_id, company_name, client_name, job_title, notes, status,
            hours_estimated, hours_spent, due_date, created_at, updated_at
          ) VALUES (
            $1, $2, $2, $3, $4, 'request_submitted',
            NULL, 0, $5, NOW(), NOW()
          )
          RETURNING id, venue_id, company_name, client_name, job_title, notes, status, hours_spent, due_date, created_at, updated_at
        ),
        tagged AS (
          INSERT INTO design_request_internal_categories (design_request_id, category, notes, set_at)
          SELECT id::text, $6, 'Auto-routed from print request because the title/client/notes identify spec-sheet work.', NOW()
          FROM inserted
          ON CONFLICT (design_request_id) DO UPDATE
          SET category = EXCLUDED.category, notes = EXCLUDED.notes, set_at = NOW()
        )
        SELECT * FROM inserted`,
        [
          resolvedVenueId || null,
          clientName,
          jobTitle,
          body.notes?.trim() || null,
          body.arrival_date || body.ship_date || null,
          SPEC_SHEET_INTERNAL_CATEGORY,
        ],
      )

      return NextResponse.json({
        routed_to_internal_hours: true,
        design_request: created.rows[0],
      }, { status: 201 })
    }

    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      const created = await PrintRequests.create({
        name: jobTitle,
        status: toTwentyStatus(body.status),
        printClientId: await resolveTwentyCompanyId(body.client_id || null, body.client_name || null),
        shippingAddress: body.shipping_address?.trim() || null,
        shipDate: body.ship_date || null,
        arrivalDate: body.arrival_date || null,
        invoiceAmount: normalizeInvoiceAmount(body.invoice_amount),
        britainNotes: body.notes?.trim() || null,
        proofLinks: JSON.stringify(parseProofLinks(body.proof_links)),
        trackingNumber: body.tracking_number?.trim() || null,
      })

      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(created) })
    }

    const result = await query(
      `INSERT INTO print_requests (
        venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date,
        britten_cost, tracking_number, status, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, NOW()
      )
      RETURNING id, venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date, britten_cost, tracking_number, status, created_at, updated_at`,
      [
        resolvedVenueId || null,
        clientName,
        jobTitle,
        body.notes?.trim() || null,
        body.shipping_address?.trim() || null,
        body.ship_date || null,
        body.arrival_date || null,
        normalizeInvoiceAmount(body.invoice_amount),
        body.tracking_number?.trim() || null,
        legacyStatusForDb(body.status),
      ],
    )

    const row = result.rows[0]
    const venueName = row.venue_id
      ? (await query('SELECT name FROM venues WHERE id = $1 LIMIT 1', [row.venue_id])).rows[0]?.name || null
      : null
    return NextResponse.json({
      print_request: {
        id: row.id,
        client_id: await findLocalClientIdByName(row.client_name || null),
        client_name: row.client_name,
        print_client_id: null,
        venue_id: row.venue_id,
        venue_name: venueName,
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
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    })
  } catch (err) {
    console.error('Error creating print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const id = body.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

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

      const updated = await PrintRequests.update(id, patch)
      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(updated) })
    }

    const updates: string[] = []
    const values: unknown[] = []

    if ('client_id' in body || 'client_name' in body) {
      values.push(body.client_name?.trim() || (await getClientNameFromLocalId(body.client_id || null)) || null)
      updates.push(`client_name = $${values.length}`)
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

    values.push(id)
    const result = await query(
      `UPDATE print_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, client_name, job_title, notes, shipping_info, ship_date, arrival_date, britten_cost, tracking_number, status, created_at, updated_at`,
      values,
    )

    if (!result.rows[0]) return NextResponse.json({ error: 'Print request not found' }, { status: 404 })

    const row = result.rows[0]
    return NextResponse.json({
      print_request: {
        id: row.id,
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
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    })
  } catch (err) {
    console.error('Error updating print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (isTwentyBackedEnabled('PRINT_REQUESTS')) {
      await PrintRequests.delete(id)
      return NextResponse.json({ ok: true })
    }

    await query('DELETE FROM print_requests WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
