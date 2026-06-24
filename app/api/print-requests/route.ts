export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { PrintRequests, fetchAllTwenty, isTwentyBackedEnabled, type TwentyPrintRequest } from '@/lib/twenty-ops'
import { normalizeVenueTriCode, resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { loadTriCodeMap, upsertTriCode, getTriCode } from '@/lib/tricode-side-tables'
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
  cancelled: 'STATUS_CANCELLED',
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

function normalizeInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function moneyPatch(value: unknown) {
  const amount = normalizeInvoiceAmount(value)
  return amount == null ? null : { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'USD' }
}

function emailToString(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  return value.primaryEmail || null
}

function emailPatch(value: unknown) {
  const email = String(value || '').trim()
  return { primaryEmail: email, additionalEmails: [] }
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

// Margin = what ANC bills the client minus what Britten charges ANC (Alexis
// notes pages 10/11). Derived read-only unless a manual override is stored.
function computeMargin(
  ancPrice: number | null,
  brittenPrice: number | null,
  brittenRushFee: number | null,
  brittenShipping: number | null,
  override?: number | null,
): number | null {
  if (override != null && Number.isFinite(override)) return override
  if (ancPrice == null) return null
  const brittenTotal = (brittenPrice || 0) + (brittenRushFee || 0) + (brittenShipping || 0)
  return Number((ancPrice - brittenTotal).toFixed(2))
}

async function reshapeTwentyPrintRequest(record: TwentyPrintRequest, tricode: string | null = null) {
  const raw = record as any
  const clientName = raw.printClient?.name || null
  const proofLinks = parseProofLinks(raw.proofLinks)
  const jobTitle = (raw.name && raw.name.trim()) || (raw.sfNumber && raw.sfNumber.trim()) || '(untitled)'
  const notesText = typeof raw.notes === 'object'
    ? (raw.notes?.markdown || raw.notes?.blocknote || '')
    : (raw.notes || '')
  const ancPrice = moneyToNumber(raw.ancPrice)
  const brittenPrice = moneyToNumber(raw.brittenPrice)
  const brittenRushFee = moneyToNumber(raw.brittenRushFee)
  const brittenShipping = moneyToNumber(raw.brittenShipping)
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
    invoice_number: raw.invoiceNumber || null,
    invoice_date: raw.invoiceDate || null,
    britten_cost: brittenPrice,
    britten_rush_fee: brittenRushFee,
    britten_shipping: brittenShipping,
    anc_price: ancPrice,
    install_fee: moneyToNumber(raw.installFee),
    rush_fee: moneyToNumber(raw.rushFee),
    shipping_fee: moneyToNumber(raw.shippingFee),
    sales_tax: moneyToNumber(raw.salesTax),
    margin: computeMargin(ancPrice, brittenPrice, brittenRushFee, brittenShipping),
    bill_to: raw.billTo || null,
    billing_notes: raw.billingNotes || null,
    anc_class: raw.ancClass || null,
    tricode: tricode,
    home_plate: raw.homePlate ?? null,
    baselines: raw.baselines ?? null,
    small_home_plate: raw.smallHomePlate ?? null,
    other_qty: raw.otherQty ?? null,
    a_frames: raw.aFrames ?? null,
    courtsides: raw.courtsides ?? null,
    dasherboards: raw.dasherboards ?? null,
    spring_hp: raw.springHp ?? null,
    submitted_by: raw.submittedBy || null,
    requester_email: emailToString(raw.requesterEmail),
    reprint: Boolean(raw.reprint),
    rush_request: Boolean(raw.rushRequest),
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

  const records: TwentyPrintRequest[] = []
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
        records.push(item)
      }
    }

    if (!page.hasNextPage || !page.nextCursor) break
    cursor = page.nextCursor
  }

  const triCodeMap = await loadTriCodeMap('print_request_tricodes', records.map((r) => r.id))
  return Promise.all(records.map((r) => reshapeTwentyPrintRequest(r, triCodeMap.get(r.id) || null)))
}

function legacyStatusForDb(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized === 'new_job' ? 'new_request' : normalized
}

async function listLegacyPrintRequests(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const clientId = searchParams.get('client_id')

  const conditions: string[] = [`pr.deleted_at IS NULL`, `NOT ${SPEC_SHEET_PRINT_SQL_WITH_ALIAS('pr')}`]
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
            pr.britten_cost, pr.tracking_number, pr.status, pr.tricode, pr.margin,
            pr.home_plate, pr.baselines, pr.small_home_plate, pr.other_qty,
            pr.a_frames, pr.courtsides, pr.dasherboards, pr.spring_hp,
            pr.created_at, pr.updated_at
     FROM print_requests pr
     LEFT JOIN venues v ON v.id = pr.venue_id
     ${whereClause}
     ORDER BY pr.updated_at DESC, pr.created_at DESC`,
    params,
  )

  return Promise.all(
    result.rows.map(async (row) => {
      const ancPrice = row.britten_cost != null ? Number(row.britten_cost) : null
      return {
        id: row.id,
        client_id: await findLocalClientIdByName(row.client_name || null),
        client_name: row.client_name,
        print_client_id: null,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        tricode: row.tricode || null,
        job_title: row.job_title,
        status: normalizeStatus(row.status),
        shipping_address: row.shipping_info,
        shipping_info: row.shipping_info,
        ship_date: row.ship_date,
        arrival_date: row.arrival_date,
        invoice_amount: row.britten_cost,
        britten_cost: row.britten_cost,
        margin: row.margin != null ? Number(row.margin) : null,
        home_plate: row.home_plate ?? null,
        baselines: row.baselines ?? null,
        small_home_plate: row.small_home_plate ?? null,
        other_qty: row.other_qty ?? null,
        a_frames: row.a_frames ?? null,
        courtsides: row.courtsides ?? null,
        dasherboards: row.dasherboards ?? null,
        spring_hp: row.spring_hp ?? null,
        notes: row.notes,
        britain_notes: row.notes,
        proof_links: [],
        proof_links_json: '[]',
        tracking_number: row.tracking_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    }),
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
        dueDate: body.due_date || null,
        invoiceAmount: moneyPatch(body.invoice_amount),
        invoiceNumber: body.invoice_number?.trim() || null,
        invoiceDate: body.invoice_date || null,
        ancPrice: moneyPatch(body.anc_price),
        installFee: moneyPatch(body.install_fee),
        rushFee: moneyPatch(body.rush_fee),
        shippingFee: moneyPatch(body.shipping_fee),
        salesTax: moneyPatch(body.sales_tax),
        brittenPrice: moneyPatch(body.britten_cost),
        brittenRushFee: moneyPatch(body.britten_rush_fee),
        brittenShipping: moneyPatch(body.britten_shipping),
        billTo: body.bill_to?.trim() || null,
        billingNotes: body.billing_notes?.trim() || null,
        ancClass: body.anc_class?.trim() || null,
        homePlate: normalizeInteger(body.home_plate),
        baselines: normalizeInteger(body.baselines),
        smallHomePlate: normalizeInteger(body.small_home_plate),
        otherQty: normalizeInteger(body.other_qty),
        submittedBy: body.submitted_by?.trim() || null,
        requesterEmail: emailPatch(body.requester_email),
        reprint: Boolean(body.reprint),
        rushRequest: Boolean(body.rush_request),
        sfNumber: body.sf_number?.trim() || null,
        britainNotes: body.notes?.trim() || null,
        proofLinks: JSON.stringify(parseProofLinks(body.proof_links)),
        trackingNumber: body.tracking_number?.trim() || null,
      })

      // Tri-code has no native field on Twenty's printRequests — persist in the
      // side table keyed by the new record id.
      const savedTriCode = await upsertTriCode('print_request_tricodes', created.id, body.venue_tricode || body.tricode)
      const saved = await PrintRequests.get(created.id)
      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(saved || created, savedTriCode) })
    }

    const result = await query(
      `INSERT INTO print_requests (
        venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date,
        britten_cost, tracking_number, status, tricode, margin,
        home_plate, baselines, small_home_plate, other_qty,
        a_frames, courtsides, dasherboards, spring_hp, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20, NOW()
      )
      RETURNING id, venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date, britten_cost, tracking_number, status, tricode, margin, home_plate, baselines, small_home_plate, other_qty, a_frames, courtsides, dasherboards, spring_hp, created_at, updated_at`,
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
        normalizeVenueTriCode(body.venue_tricode || body.tricode),
        normalizeInvoiceAmount(body.margin),
        normalizeInteger(body.home_plate),
        normalizeInteger(body.baselines),
        normalizeInteger(body.small_home_plate),
        normalizeInteger(body.other_qty),
        normalizeInteger(body.a_frames),
        normalizeInteger(body.courtsides),
        normalizeInteger(body.dasherboards),
        normalizeInteger(body.spring_hp),
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
        tricode: row.tricode || null,
        job_title: row.job_title,
        status: normalizeStatus(row.status),
        shipping_address: row.shipping_info,
        shipping_info: row.shipping_info,
        ship_date: row.ship_date,
        arrival_date: row.arrival_date,
        invoice_amount: row.britten_cost,
        britten_cost: row.britten_cost,
        margin: row.margin != null ? Number(row.margin) : null,
        home_plate: row.home_plate ?? null,
        baselines: row.baselines ?? null,
        small_home_plate: row.small_home_plate ?? null,
        other_qty: row.other_qty ?? null,
        a_frames: row.a_frames ?? null,
        courtsides: row.courtsides ?? null,
        dasherboards: row.dasherboards ?? null,
        spring_hp: row.spring_hp ?? null,
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
      if ('due_date' in body) patch.dueDate = body.due_date || null
      if ('invoice_amount' in body) patch.invoiceAmount = moneyPatch(body.invoice_amount)
      if ('invoice_number' in body) patch.invoiceNumber = body.invoice_number?.trim() || null
      if ('invoice_date' in body) patch.invoiceDate = body.invoice_date || null
      if ('anc_price' in body) patch.ancPrice = moneyPatch(body.anc_price)
      if ('install_fee' in body) patch.installFee = moneyPatch(body.install_fee)
      if ('rush_fee' in body) patch.rushFee = moneyPatch(body.rush_fee)
      if ('shipping_fee' in body) patch.shippingFee = moneyPatch(body.shipping_fee)
      if ('sales_tax' in body) patch.salesTax = moneyPatch(body.sales_tax)
      if ('britten_cost' in body) patch.brittenPrice = moneyPatch(body.britten_cost)
      if ('britten_rush_fee' in body) patch.brittenRushFee = moneyPatch(body.britten_rush_fee)
      if ('britten_shipping' in body) patch.brittenShipping = moneyPatch(body.britten_shipping)
      if ('bill_to' in body) patch.billTo = body.bill_to?.trim() || null
      if ('billing_notes' in body) patch.billingNotes = body.billing_notes?.trim() || null
      if ('anc_class' in body) patch.ancClass = body.anc_class?.trim() || null
      if ('home_plate' in body) patch.homePlate = normalizeInteger(body.home_plate)
      if ('baselines' in body) patch.baselines = normalizeInteger(body.baselines)
      if ('small_home_plate' in body) patch.smallHomePlate = normalizeInteger(body.small_home_plate)
      if ('other_qty' in body) patch.otherQty = normalizeInteger(body.other_qty)
      if ('submitted_by' in body) patch.submittedBy = body.submitted_by?.trim() || null
      if ('requester_email' in body) patch.requesterEmail = emailPatch(body.requester_email)
      if ('reprint' in body) patch.reprint = Boolean(body.reprint)
      if ('rush_request' in body) patch.rushRequest = Boolean(body.rush_request)
      if ('sf_number' in body) patch.sfNumber = body.sf_number?.trim() || null
      if ('notes' in body) patch.britainNotes = body.notes?.trim() || null
      if ('proof_links' in body) patch.proofLinks = JSON.stringify(parseProofLinks(body.proof_links))
      if ('tracking_number' in body) patch.trackingNumber = body.tracking_number?.trim() || null
      if ('home_plate' in body) patch.homePlate = normalizeInteger(body.home_plate)

      const updated = await PrintRequests.update(id, patch)
      // Tri-code side table (Twenty has no native field).
      let triCode: string | null
      if ('venue_tricode' in body || 'tricode' in body) {
        triCode = await upsertTriCode('print_request_tricodes', id, body.venue_tricode ?? body.tricode)
      } else {
        triCode = await getTriCode('print_request_tricodes', id)
      }
      const saved = await PrintRequests.get(updated.id)
      return NextResponse.json({ print_request: await reshapeTwentyPrintRequest(saved || updated, triCode) })
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
    if ('venue_tricode' in body || 'tricode' in body) {
      values.push(normalizeVenueTriCode(body.venue_tricode ?? body.tricode))
      updates.push(`tricode = $${values.length}`)
      // Keep venue derivable from the tri-code (backward-compatible link).
      const resolvedVenueId = await resolveVenueIdFromTriCode(body.venue_tricode ?? body.tricode)
      if (resolvedVenueId) {
        values.push(resolvedVenueId)
        updates.push(`venue_id = $${values.length}`)
      }
    }
    if ('margin' in body) {
      values.push(normalizeInvoiceAmount(body.margin))
      updates.push(`margin = $${values.length}`)
    }
    for (const [bodyKey, column] of [
      ['home_plate', 'home_plate'],
      ['baselines', 'baselines'],
      ['small_home_plate', 'small_home_plate'],
      ['other_qty', 'other_qty'],
      ['a_frames', 'a_frames'],
      ['courtsides', 'courtsides'],
      ['dasherboards', 'dasherboards'],
      ['spring_hp', 'spring_hp'],
    ] as const) {
      if (bodyKey in body) {
        values.push(normalizeInteger(body[bodyKey]))
        updates.push(`${column} = $${values.length}`)
      }
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(id)
    const result = await query(
      `UPDATE print_requests
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date, britten_cost, tracking_number, status, tricode, margin, home_plate, baselines, small_home_plate, other_qty, a_frames, courtsides, dasherboards, spring_hp, created_at, updated_at`,
      values,
    )

    if (!result.rows[0]) return NextResponse.json({ error: 'Print request not found' }, { status: 404 })

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
        tricode: row.tricode || null,
        job_title: row.job_title,
        status: normalizeStatus(row.status),
        shipping_address: row.shipping_info,
        shipping_info: row.shipping_info,
        ship_date: row.ship_date,
        arrival_date: row.arrival_date,
        invoice_amount: row.britten_cost,
        britten_cost: row.britten_cost,
        margin: row.margin != null ? Number(row.margin) : null,
        home_plate: row.home_plate ?? null,
        baselines: row.baselines ?? null,
        small_home_plate: row.small_home_plate ?? null,
        other_qty: row.other_qty ?? null,
        a_frames: row.a_frames ?? null,
        courtsides: row.courtsides ?? null,
        dasherboards: row.dasherboards ?? null,
        spring_hp: row.spring_hp ?? null,
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
      // Soft-delete via Twenty's REST DELETE (stamps deletedAt, recoverable).
      // Keep the tri-code side row so a restore comes back intact.
      await PrintRequests.delete(id)
      return NextResponse.json({ ok: true })
    }

    // Soft-delete: stamp deleted_at; row drops out of every view, recoverable.
    await query('UPDATE print_requests SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting print request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
