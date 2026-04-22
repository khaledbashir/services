import { query } from '@/lib/db'
import { fetchAllTwenty, type TwentyPrintRequest } from '@/lib/twenty-ops'

export const PRINT_REQUEST_STATUS_ORDER = [
  'new_job',
  'awaiting_layout',
  'awaiting_approval',
  'approved',
  'in_production',
  'shipped',
  'invoiced',
] as const

export type PrintRequestStatus = typeof PRINT_REQUEST_STATUS_ORDER[number]

const DASHBOARD_TO_TWENTY_STATUS: Record<PrintRequestStatus, string> = {
  new_job: 'STATUS_NEW_JOB',
  awaiting_layout: 'STATUS_WAITING_LAYOUT',
  awaiting_approval: 'STATUS_AWAITING_APPROVAL',
  approved: 'STATUS_APPROVED',
  in_production: 'STATUS_IN_PRODUCTION',
  shipped: 'STATUS_SHIPPED',
  invoiced: 'STATUS_INVOICED',
}

const TWENTY_TO_DASHBOARD_STATUS: Record<string, PrintRequestStatus> = {
  STATUS_NEW_JOB: 'new_job',
  STATUS_WAITING_LAYOUT: 'awaiting_layout',
  STATUS_AWAITING_APPROVAL: 'awaiting_approval',
  STATUS_APPROVED: 'approved',
  STATUS_IN_PRODUCTION: 'in_production',
  STATUS_SHIPPED: 'shipped',
  STATUS_INVOICED: 'invoiced',
  new_job: 'new_job',
  awaiting_layout: 'awaiting_layout',
  awaiting_approval: 'awaiting_approval',
  approved: 'approved',
  in_production: 'in_production',
  shipped: 'shipped',
  invoiced: 'invoiced',
  new_request: 'new_job',
}

interface LocalClientRow {
  id: string
  name: string
}

interface TwentyCompany {
  id: string
  name: string
}

interface ClientLookup {
  byId: Map<string, LocalClientRow>
  byNormalizedName: Map<string, LocalClientRow>
}

interface CompanyLookup {
  byId: Map<string, TwentyCompany>
  byNormalizedName: Map<string, TwentyCompany>
}

export interface DashboardPrintRequest {
  id: string
  job_title: string
  status: PrintRequestStatus
  client_id: string | null
  client_name: string | null
  shipping_info: string | null
  ship_date: string | null
  arrival_date: string | null
  invoice_amount: number | null
  notes: string | null
  proof_links: string[]
  tracking_number: string | null
  created_at: string
  updated_at: string
  created_date: string
  updated_date: string
  venue_id: string | null
  venue_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  anc_cost: number | null
  britten_cost: number | null
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseProofLinks(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    }
  } catch {}
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringifyRichText(value: TwentyPrintRequest['notes']): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value.markdown === 'string' && value.markdown.trim()) return value.markdown.trim()
  if (typeof value.blocknote === 'string' && value.blocknote.trim()) return value.blocknote.trim()
  return null
}

export function normalizePrintRequestStatus(input: string | null | undefined): PrintRequestStatus {
  return TWENTY_TO_DASHBOARD_STATUS[input || ''] || 'new_job'
}

export function toTwentyPrintRequestStatus(status: string | null | undefined): string {
  return DASHBOARD_TO_TWENTY_STATUS[normalizePrintRequestStatus(status)]
}

export async function getLocalClientLookup(): Promise<ClientLookup> {
  const result = await query('SELECT id, name FROM clients ORDER BY name ASC')
  const byId = new Map<string, LocalClientRow>()
  const byNormalizedName = new Map<string, LocalClientRow>()
  for (const row of result.rows as LocalClientRow[]) {
    byId.set(row.id, row)
    byNormalizedName.set(normalizeName(row.name), row)
  }
  return { byId, byNormalizedName }
}

export async function getTwentyCompanyLookup(): Promise<CompanyLookup> {
  const companies = await fetchAllTwenty<TwentyCompany>('companies')
  const byId = new Map<string, TwentyCompany>()
  const byNormalizedName = new Map<string, TwentyCompany>()
  for (const company of companies) {
    byId.set(company.id, company)
    byNormalizedName.set(normalizeName(company.name), company)
  }
  return { byId, byNormalizedName }
}

export async function resolveTwentyCompany(input: {
  clientId?: string | null
  clientName?: string | null
}): Promise<{ companyId: string | null; companyName: string | null }> {
  const [localClients, twentyCompanies] = await Promise.all([
    getLocalClientLookup(),
    getTwentyCompanyLookup(),
  ])

  const localClient = input.clientId ? (localClients.byId.get(input.clientId) || null) : null
  const desiredName = localClient?.name || input.clientName || null
  if (!desiredName) return { companyId: null, companyName: null }

  const exact = twentyCompanies.byNormalizedName.get(normalizeName(desiredName))
  if (exact) return { companyId: exact.id, companyName: exact.name }

  const needle = normalizeName(desiredName)
  for (const [name, company] of twentyCompanies.byNormalizedName.entries()) {
    if (name.includes(needle) || needle.includes(name)) {
      return { companyId: company.id, companyName: company.name }
    }
  }

  return { companyId: null, companyName: desiredName }
}

export function shapeTwentyPrintRequest(
  record: TwentyPrintRequest,
  localClients: ClientLookup
): DashboardPrintRequest {
  const clientName = record.printClient?.name || null
  const localClient = clientName ? (localClients.byNormalizedName.get(normalizeName(clientName)) || null) : null

  return {
    id: record.id,
    job_title: record.name || '(untitled print request)',
    status: normalizePrintRequestStatus(record.status),
    client_id: localClient?.id || null,
    client_name: clientName,
    shipping_info: record.shippingAddress || null,
    ship_date: record.shipDate || null,
    arrival_date: record.arrivalDate || null,
    invoice_amount: record.invoiceAmount ?? null,
    notes: record.britainNotes || stringifyRichText(record.notes),
    proof_links: parseProofLinks(record.proofLinks),
    tracking_number: record.trackingNumber || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    created_date: record.createdAt,
    updated_date: record.updatedAt,
    venue_id: null,
    venue_name: null,
    assignee_id: null,
    assignee_name: null,
    anc_cost: null,
    britten_cost: record.invoiceAmount ?? null,
  }
}

export function buildTwentyPrintRequestPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (body.job_title !== undefined) patch.name = String(body.job_title || '').trim() || null
  if (body.status !== undefined) patch.status = toTwentyPrintRequestStatus(String(body.status || ''))
  if (body.shipping_info !== undefined) patch.shippingAddress = String(body.shipping_info || '').trim() || null
  if (body.ship_date !== undefined) patch.shipDate = body.ship_date || null
  if (body.arrival_date !== undefined) patch.arrivalDate = body.arrival_date || null
  if (body.invoice_amount !== undefined) {
    patch.invoiceAmount = body.invoice_amount === '' || body.invoice_amount == null ? null : Number(body.invoice_amount)
  }
  if (body.notes !== undefined) patch.britainNotes = String(body.notes || '').trim() || null
  if (body.tracking_number !== undefined) patch.trackingNumber = String(body.tracking_number || '').trim() || null
  if (body.proof_links !== undefined) {
    const proofLinks = Array.isArray(body.proof_links)
      ? body.proof_links.map((item) => String(item || '').trim()).filter(Boolean)
      : parseProofLinks(String(body.proof_links || ''))
    patch.proofLinks = JSON.stringify(proofLinks)
  }

  return patch
}
