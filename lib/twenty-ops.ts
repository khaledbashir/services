/**
 * Twenty CRM Ops Client
 *
 * Typed REST client for the 8 "ops" objects that the Service Dashboard
 * rewrote from local Postgres to Twenty-backed: inventoryAsset,
 * maintenanceLog, walkthroughLog, rmaTracker, designRequest,
 * cgDesignRequest, designerTimeEntry, designerHoursBudget.
 *
 * All reads expand one level of relations via `?depth=1`. All writes
 * use Twenty's standard REST shape. Venue filtering works in two
 * directions:
 *
 *   - Dashboard → Twenty: translate dashboard `venue_id` (uuid in
 *     anc_services.venues) to the Twenty venue UUID before filtering.
 *   - Twenty → Dashboard: resolve the embedded venue object back to a
 *     dashboard-shaped `{ venue_id, venue_name }` so page components
 *     don't have to think about the dual-ID world.
 *
 * Rate limit + auth reuses `twentyFetch`/`fetchAllTwenty` from
 * `lib/twenty-sync.ts` — a shared chain that respects Twenty's ~10rps
 * bulk-write limit and survives 429s with exponential backoff.
 */

import { twentyFetch, fetchAllTwenty, buildVenueIndex } from '@/lib/twenty-sync'
import { query } from '@/lib/db'

// ── Venue ID translation ─────────────────────────────────────────────────────
// Twenty's `venues` custom object stores the dashboard UUID in `servicesId`.
// We maintain two in-memory lookups (60s TTL): name→twentyId (from the shared
// buildVenueIndex), plus dashboardUuid→twentyId (built from the same scan).

interface VenueLookup {
  nameToTwentyId: Map<string, string>
  dashboardToTwentyId: Map<string, string>
  twentyToDashboard: Map<string, { venue_id: string; venue_name: string }>
  expiresAt: number
}

let venueLookupCache: VenueLookup | null = null

async function getVenueLookup(): Promise<VenueLookup> {
  const now = Date.now()
  if (venueLookupCache && venueLookupCache.expiresAt > now) return venueLookupCache

  const nameToTwentyId = await buildVenueIndex()
  // Pull Twenty venues again to get `servicesId` + `name` pairs (buildVenueIndex only returns name→id)
  const venues = await fetchAllTwenty<{ id: string; name: string; servicesId: string | null }>(
    'venues'
  )
  const dashboardToTwentyId = new Map<string, string>()
  const twentyToDashboard = new Map<string, { venue_id: string; venue_name: string }>()
  for (const v of venues) {
    if (v.servicesId) {
      dashboardToTwentyId.set(v.servicesId, v.id)
      twentyToDashboard.set(v.id, { venue_id: v.servicesId, venue_name: v.name })
    }
  }

  venueLookupCache = {
    nameToTwentyId,
    dashboardToTwentyId,
    twentyToDashboard,
    expiresAt: now + 60_000,
  }
  return venueLookupCache
}

export async function dashboardVenueIdToTwentyId(dashboardUuid: string): Promise<string | null> {
  const lookup = await getVenueLookup()
  return lookup.dashboardToTwentyId.get(dashboardUuid) || null
}

export async function dashboardVenueIdsToTwentyIds(dashboardUuids: string[]): Promise<string[]> {
  const lookup = await getVenueLookup()
  const out: string[] = []
  for (const id of dashboardUuids) {
    const mapped = lookup.dashboardToTwentyId.get(id)
    if (mapped) out.push(mapped)
  }
  return out
}

export async function twentyVenueToDashboard(twentyVenueId: string): Promise<{ venue_id: string; venue_name: string } | null> {
  const lookup = await getVenueLookup()
  return lookup.twentyToDashboard.get(twentyVenueId) || null
}

// ── Venue filter helper ──────────────────────────────────────────────────────
// Mirrors lib/venue-filter.ts::buildVenueFilterClause but for Twenty REST
// syntax. If the caller passes `null`, no filter is applied (admin/manager
// see everything). If an empty list, the filter forces zero results (tech
// with no linked venues).

export async function buildTwentyVenueFilter(
  dashboardVenueIds: string[] | null,
  twentyFieldName: string
): Promise<string | null> {
  if (dashboardVenueIds === null) return null
  if (dashboardVenueIds.length === 0) {
    // Impossible UUID — forces empty result set
    return `${twentyFieldName}[eq]:"00000000-0000-0000-0000-000000000000"`
  }
  const twentyIds = await dashboardVenueIdsToTwentyIds(dashboardVenueIds)
  if (twentyIds.length === 0) return `${twentyFieldName}[eq]:"00000000-0000-0000-0000-000000000000"`
  const quoted = twentyIds.map(id => `"${id}"`).join(',')
  return `${twentyFieldName}[in]:[${quoted}]`
}

// ── TypeScript interfaces mirroring Twenty schemas ───────────────────────────

export interface TwentyInventoryAsset {
  id: string
  name: string | null
  assetNumber: string | null
  amount: number | null
  partName: string | null
  partNumber: string | null
  projectCode: string | null
  locationRoom: string | null
  locationCode: string | null
  screenLocation: string | null
  threeLetterCode: string | null
  manufacturer: string | null
  displayType: string | null
  orientation: string | null
  renderName: string | null
  connectedDevices: string | null
  assetVenueId: string | null
  assetVenue?: { id: string; name: string; servicesId?: string | null }
  assetDisplayLocationId?: string | null
  timelineUrl?: { primaryLinkUrl?: string }
  createdAt: string
  updatedAt: string
}

export interface TwentyMaintenanceLog {
  id: string
  name: string | null
  issue: string | null
  detailsToResolve: { blocknote?: string; markdown?: string } | string | null
  scheduledDate: string | null
  scheduledEndTime: string | null
  lastUpdated: string | null
  locationReported: string | null
  escortInformation: string | null
  maintenanceStationId: string | null
  maintenanceStation?: { id: string; name: string }
  maintenanceAssetId: string | null
  maintenanceAsset?: { id: string; name: string }
  logTechnicianId: string | null
  logTechnician?: { id: string; name: { firstName: string; lastName: string } }
  createdAt: string
  updatedAt: string
}

export interface TwentyWalkthroughLog {
  id: string
  name: string | null
  logDate: string | null
  logTime: string | null
  notes: { blocknote?: string; markdown?: string } | string | null
  result: string | null
  taskTargetsId?: string | null
  createdAt: string
  updatedAt: string
}

export interface TwentyRmaTracker {
  id: string
  partNumber: string | null
  modelNumber: string | null
  partsDetails: string | null
  clientName: string | null
  submissionContact: string | null
  remitToStock: boolean | null
  rmaCompanyId: string | null
  rmaCompany?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export interface TwentyDesignRequest {
  id: string
  name: string | null
  aiPrompt: string | null
  aiGeneratedBy: string | null
  boardSection: string | null
  status: string | null
  proofLink: string | null
  proofSentAt: string | null
  projectLocation: string | null
  localFilePath: string | null
  wrikeTaskId: string | null
  designClientId: string | null
  designClient?: { id: string; name: string }
  designAssigneeId: string | null
  designAssignee?: { id: string; name: { firstName: string; lastName: string } }
  generatedImage?: { primaryLinkUrl?: string } | null
  createdAt: string
  updatedAt: string
}

export interface TwentyCgDesignRequest {
  id: string
  clientTriCode: string | null
  teamName: string | null
  sport: string | null
  status: string | null
  wrikeTaskId: string | null
  proofClientEmail: string | null
  proofSentAt: string | null
  proofLastViewedAt: string | null
  proofRespondedAt: string | null
  cgClientId: string | null
  cgClient?: { id: string; name: string }
  cgDesignerId: string | null
  cgDesigner?: { id: string; name: { firstName: string; lastName: string } }
  createdAt: string
  updatedAt: string
}

export interface TwentyDesignerTimeEntry {
  id: string
  taskName: string | null
  comment: string | null
  wrikeTimelogId: string | null
  entryDesignerId: string | null
  entryDesigner?: { id: string; name: { firstName: string; lastName: string } }
  createdAt: string
  updatedAt: string
}

export interface TwentyDesignerHoursBudget {
  id: string
  currentHoursUsed: number | null
  alert50Pct: boolean | null
  budgetClientId: string | null
  budgetClient?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export interface TwentyPartsOrder {
  id: string
  // Twenty's partsOrders uses `name` as the venue label (not a relation), and
  // the requestor/photo fields are singular + spelled with an 'o'. The older
  // interface used Americanized 'requester*' + plural photoUrls which silently
  // read as undefined on every row.
  name: string | null
  venueId: string | null
  venue?: { id: string; name: string }
  requestorName: string | null
  requestorEmail: string | null
  partsNeeded: string | null
  photoUrl: string | null
  shippingAddress: string | null
  status: string | null
  quantity: number | null
  notes: { blocknote?: string; markdown?: string } | string | null
  wrikeTaskId: string | null
  createdAt: string
  updatedAt: string
}

export interface TwentyPrintRequest {
  id: string
  name: string | null
  status: string | null
  printClientId: string | null
  printClient?: { id: string; name: string }
  shippingAddress: string | null
  shipDate: string | null
  arrivalDate: string | null
  invoiceAmount: number | null
  britainNotes: string | null
  notes: { blocknote?: string; markdown?: string } | string | null
  proofLinks: string | null
  trackingNumber: string | null
  createdAt: string
  updatedAt: string
}

// ── Generic list/get/create/update/delete helpers ────────────────────────────
// Every ops object shares the same REST shape, so one set of helpers serves
// all eight. Each module re-exports these with its own type narrowing below.

interface ListOptions {
  limit?: number
  startingAfter?: string
  filter?: string   // e.g. 'status[eq]:"open"'
  orderBy?: string  // e.g. 'createdAt[DescNullsLast]'
  depth?: number    // default 1 — expands one level of relations
}

interface ListResult<T> {
  items: T[]
  nextCursor: string | null
  hasNextPage: boolean
}

async function listObjects<T>(
  collection: string,
  opts: ListOptions = {}
): Promise<ListResult<T>> {
  const params = new URLSearchParams()
  params.set('limit', String(opts.limit ?? 60))
  params.set('depth', String(opts.depth ?? 1))
  if (opts.startingAfter) params.set('starting_after', opts.startingAfter)
  if (opts.orderBy) params.set('order_by', opts.orderBy)
  if (opts.filter) params.set('filter', opts.filter)

  const res = await twentyFetch(`${collection}?${params.toString()}`, { method: 'GET' })
  if (!res.ok) throw new Error(`Twenty list ${collection} failed: ${res.status}`)
  const body = await res.json()
  const rows: T[] = Array.isArray(body?.data?.[collection]) ? body.data[collection] : []
  const pageInfo = body?.pageInfo || body?.data?.pageInfo || {}
  return {
    items: rows,
    nextCursor: pageInfo.endCursor || null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
  }
}

async function getObject<T>(collection: string, id: string, depth = 1): Promise<T | null> {
  const res = await twentyFetch(`${collection}/${id}?depth=${depth}`, { method: 'GET' })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Twenty get ${collection}/${id} failed: ${res.status}`)
  }
  const body = await res.json()
  const data = body?.data || {}
  const key = Object.keys(data)[0]
  return (key ? (data[key] as T) : null) || null
}

async function createObject<T>(collection: string, payload: Record<string, unknown>): Promise<T> {
  const res = await twentyFetch(collection, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Twenty create ${collection} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const body = await res.json()
  const data = body?.data || {}
  const key = Object.keys(data)[0]
  return data[key] as T
}

async function updateObject<T>(
  collection: string,
  id: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await twentyFetch(`${collection}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Twenty update ${collection}/${id} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const body = await res.json()
  const data = body?.data || {}
  const key = Object.keys(data)[0]
  return data[key] as T
}

async function deleteObject(collection: string, id: string): Promise<void> {
  const res = await twentyFetch(`${collection}/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Twenty delete ${collection}/${id} failed: ${res.status}`)
  }
}

// ── Per-module typed facades ─────────────────────────────────────────────────
// These narrow the generic helpers to each object's collection name + TS type.

export const Inventory = {
  collection: 'inventoryAssets',
  venueField: 'assetVenueId',
  list: (opts?: ListOptions) => listObjects<TwentyInventoryAsset>('inventoryAssets', opts),
  get:  (id: string) => getObject<TwentyInventoryAsset>('inventoryAssets', id),
  create: (data: Partial<TwentyInventoryAsset>) => createObject<TwentyInventoryAsset>('inventoryAssets', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyInventoryAsset>) => updateObject<TwentyInventoryAsset>('inventoryAssets', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('inventoryAssets', id),
}

export const Maintenance = {
  collection: 'maintenanceLogs',
  venueField: 'maintenanceStationId', // note: not a venue FK directly — station is
  list: (opts?: ListOptions) => listObjects<TwentyMaintenanceLog>('maintenanceLogs', opts),
  get:  (id: string) => getObject<TwentyMaintenanceLog>('maintenanceLogs', id),
  create: (data: Partial<TwentyMaintenanceLog>) => createObject<TwentyMaintenanceLog>('maintenanceLogs', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyMaintenanceLog>) => updateObject<TwentyMaintenanceLog>('maintenanceLogs', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('maintenanceLogs', id),
}

export const Walkthroughs = {
  collection: 'walkthroughLogs',
  venueField: null as string | null, // walkthroughLog does not link directly to a venue in Twenty
  list: (opts?: ListOptions) => listObjects<TwentyWalkthroughLog>('walkthroughLogs', opts),
  get:  (id: string) => getObject<TwentyWalkthroughLog>('walkthroughLogs', id),
  create: (data: Partial<TwentyWalkthroughLog>) => createObject<TwentyWalkthroughLog>('walkthroughLogs', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyWalkthroughLog>) => updateObject<TwentyWalkthroughLog>('walkthroughLogs', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('walkthroughLogs', id),
}

export const Rma = {
  collection: 'rmaTrackers',
  venueField: 'rmaCompanyId',
  list: (opts?: ListOptions) => listObjects<TwentyRmaTracker>('rmaTrackers', opts),
  get:  (id: string) => getObject<TwentyRmaTracker>('rmaTrackers', id),
  create: (data: Partial<TwentyRmaTracker>) => createObject<TwentyRmaTracker>('rmaTrackers', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyRmaTracker>) => updateObject<TwentyRmaTracker>('rmaTrackers', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('rmaTrackers', id),
}

export const Designs = {
  collection: 'designRequests',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyDesignRequest>('designRequests', opts),
  get:  (id: string) => getObject<TwentyDesignRequest>('designRequests', id),
  create: (data: Partial<TwentyDesignRequest>) => createObject<TwentyDesignRequest>('designRequests', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyDesignRequest>) => updateObject<TwentyDesignRequest>('designRequests', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('designRequests', id),
}

export const CgDesigns = {
  collection: 'cgDesignRequests',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyCgDesignRequest>('cgDesignRequests', opts),
  get:  (id: string) => getObject<TwentyCgDesignRequest>('cgDesignRequests', id),
  create: (data: Partial<TwentyCgDesignRequest>) => createObject<TwentyCgDesignRequest>('cgDesignRequests', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyCgDesignRequest>) => updateObject<TwentyCgDesignRequest>('cgDesignRequests', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('cgDesignRequests', id),
}

export const TimeEntries = {
  collection: 'designerTimeEntries',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyDesignerTimeEntry>('designerTimeEntries', opts),
  get:  (id: string) => getObject<TwentyDesignerTimeEntry>('designerTimeEntries', id),
  create: (data: Partial<TwentyDesignerTimeEntry>) => createObject<TwentyDesignerTimeEntry>('designerTimeEntries', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyDesignerTimeEntry>) => updateObject<TwentyDesignerTimeEntry>('designerTimeEntries', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('designerTimeEntries', id),
}

export const HoursBudgets = {
  collection: 'designerHoursBudgets',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyDesignerHoursBudget>('designerHoursBudgets', opts),
  get:  (id: string) => getObject<TwentyDesignerHoursBudget>('designerHoursBudgets', id),
  create: (data: Partial<TwentyDesignerHoursBudget>) => createObject<TwentyDesignerHoursBudget>('designerHoursBudgets', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyDesignerHoursBudget>) => updateObject<TwentyDesignerHoursBudget>('designerHoursBudgets', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('designerHoursBudgets', id),
}

export const PartsOrders = {
  collection: 'partsOrders',
  venueField: 'venueId',
  list: (opts?: ListOptions) => listObjects<TwentyPartsOrder>('partsOrders', opts),
  get:  (id: string) => getObject<TwentyPartsOrder>('partsOrders', id),
  create: (data: Partial<TwentyPartsOrder>) => createObject<TwentyPartsOrder>('partsOrders', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyPartsOrder>) => updateObject<TwentyPartsOrder>('partsOrders', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('partsOrders', id),
}

export const PrintRequests = {
  collection: 'printRequests',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyPrintRequest>('printRequests', opts),
  get:  (id: string) => getObject<TwentyPrintRequest>('printRequests', id),
  create: (data: Partial<TwentyPrintRequest>) => createObject<TwentyPrintRequest>('printRequests', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyPrintRequest>) => updateObject<TwentyPrintRequest>('printRequests', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('printRequests', id),
}

// ── Re-exports so callers only need to import from '@/lib/twenty-ops' ────────
export { twentyFetch, fetchAllTwenty } from '@/lib/twenty-sync'

// ── Env-flag gate ────────────────────────────────────────────────────────────
// Each module is gated individually so rewrites can flip on/off without a
// code change. Use in API routes: `if (!isTwentyBackedEnabled('INVENTORY'))
// return callLegacyRoute()`.

export function isTwentyBackedEnabled(moduleName: string): boolean {
  const flag = process.env[`TWENTY_BACKED_${moduleName.toUpperCase()}`]
  return flag === '1' || flag === 'true'
}

// ── Content Schedule ─────────────────────────────────────────────────────────
// Replaces Alexis's Wrike content-schedule workflow. Auto-stale logic lives in
// /api/cron/content-schedule-stale — sets status to 'confirmed_live' when
// runEndDate passes and status is still 'content_live'.

export interface TwentyContentSchedule {
  id: string
  name: string | null
  contentTitle: string | null
  startDate: string | null
  endDate: string | null
  status: string | null
  notes: string | null
  filesReady: boolean | null
  operator: string | null
  ftpLocation: string | null
  proofLink: string | null
  projectLocation: string | null
  wrikeTaskId: string | null
  scheduleClientId: string | null
  scheduleClient?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export const ContentSchedule = {
  collection: 'contentSchedules',
  // contentSchedules has no venue relation in Twenty — client-scoped only.
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyContentSchedule>('contentSchedules', opts),
  get:  (id: string) => getObject<TwentyContentSchedule>('contentSchedules', id),
  create: (data: Partial<TwentyContentSchedule>) => createObject<TwentyContentSchedule>('contentSchedules', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyContentSchedule>) => updateObject<TwentyContentSchedule>('contentSchedules', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('contentSchedules', id),
}

export interface TwentyOpeningChecklistItem {
  id: string
  name: string | null
  venueId: string | null
  venue?: { id: string; name: string; servicesId?: string | null }
  league: string | null
  phase: string | null
  openingDate: string | null
  dueDate: string | null
  itemDescription: { blocknote?: string; markdown?: string } | string | null
  checklistAssigneeId: string | null
  checklistAssignee?: { id: string; name: string; servicesId?: string | null }
  status: string | null
  completedAt: string | null
  notes: { blocknote?: string; markdown?: string } | string | null
  createdAt: string
  updatedAt: string
}

export interface TwentyOpeningChecklistTemplate {
  id: string
  name: string | null
  league: string | null
  items: unknown
  createdAt: string
  updatedAt: string
}

export const OpeningChecklist = {
  collection: 'openingChecklistItems',
  venueField: 'venueId' as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyOpeningChecklistItem>('openingChecklistItems', opts),
  get:  (id: string) => getObject<TwentyOpeningChecklistItem>('openingChecklistItems', id),
  create: (data: Partial<TwentyOpeningChecklistItem>) => createObject<TwentyOpeningChecklistItem>('openingChecklistItems', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyOpeningChecklistItem>) => updateObject<TwentyOpeningChecklistItem>('openingChecklistItems', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('openingChecklistItems', id),
}

export const OpeningChecklistTemplate = {
  collection: 'openingChecklistTemplates',
  venueField: null as string | null,
  list: (opts?: ListOptions) => listObjects<TwentyOpeningChecklistTemplate>('openingChecklistTemplates', opts),
  get:  (id: string) => getObject<TwentyOpeningChecklistTemplate>('openingChecklistTemplates', id),
  create: (data: Partial<TwentyOpeningChecklistTemplate>) => createObject<TwentyOpeningChecklistTemplate>('openingChecklistTemplates', data as Record<string, unknown>),
  update: (id: string, data: Partial<TwentyOpeningChecklistTemplate>) => updateObject<TwentyOpeningChecklistTemplate>('openingChecklistTemplates', id, data as Record<string, unknown>),
  delete: (id: string) => deleteObject('openingChecklistTemplates', id),
}
