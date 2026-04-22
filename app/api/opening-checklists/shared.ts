import { query } from '@/lib/db'
import {
  dashboardVenueIdToTwentyId,
  fetchAllTwenty,
  twentyVenueToDashboard,
  type TwentyOpeningChecklistItem,
  type TwentyOpeningChecklistTemplate,
} from '@/lib/twenty-ops'

export const OPENING_CHECKLIST_PHASES = [
  '90_day',
  '60_day',
  '30_day',
  'opening_week',
  'opening_day',
] as const

export const OPENING_CHECKLIST_PHASE_LABELS: Record<OpeningChecklistPhase, string> = {
  '90_day': '90 Day',
  '60_day': '60 Day',
  '30_day': '30 Day',
  opening_week: 'Opening Week',
  opening_day: 'Opening Day',
}

export const OPENING_CHECKLIST_STATUS_ORDER = [
  'pending',
  'in_progress',
  'blocked',
  'complete',
  'skipped',
] as const

export const OPENING_CHECKLIST_LEAGUES = [
  'MLB',
  'NBA',
  'NHL',
  'NFL',
  'NCAA',
  'OTHER',
] as const

export type OpeningChecklistPhase = typeof OPENING_CHECKLIST_PHASES[number]
export type OpeningChecklistStatus = typeof OPENING_CHECKLIST_STATUS_ORDER[number]
export type OpeningChecklistLeague = typeof OPENING_CHECKLIST_LEAGUES[number]

export interface OpeningChecklistTemplateSeedItem {
  phase: OpeningChecklistPhase
  name: string
  itemDescription: string
  defaultAssigneeRole: 'technician' | 'manager' | 'tech_support' | 'admin'
}

export interface DashboardOpeningChecklistItem {
  id: string
  venue_id: string | null
  venue_name: string | null
  name: string
  league: OpeningChecklistLeague | null
  phase: OpeningChecklistPhase
  opening_date: string | null
  due_date: string | null
  item_description: string | null
  checklist_assignee_id: string | null
  checklist_assignee_name: string | null
  status: OpeningChecklistStatus
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DashboardOpeningChecklistTemplate {
  id: string
  name: string
  league: OpeningChecklistLeague | null
  items: OpeningChecklistTemplateSeedItem[]
  created_at: string
  updated_at: string
}

interface LocalStaffRow {
  id: string
  full_name: string
  role: string
}

interface TwentyTechnicianRow {
  id: string
  name: string | null
  servicesId: string | null
  staffRole: string | null
}

const PHASE_OFFSETS: Record<OpeningChecklistPhase, number> = {
  '90_day': 90,
  '60_day': 60,
  '30_day': 30,
  opening_week: 7,
  opening_day: 0,
}

const DASHBOARD_TO_TWENTY_PHASE: Record<OpeningChecklistPhase, string> = {
  '90_day': 'PHASE_90_DAY',
  '60_day': 'PHASE_60_DAY',
  '30_day': 'PHASE_30_DAY',
  opening_week: 'PHASE_OPENING_WEEK',
  opening_day: 'PHASE_OPENING_DAY',
}

const TWENTY_TO_DASHBOARD_PHASE: Record<string, OpeningChecklistPhase> = {
  PHASE_90_DAY: '90_day',
  PHASE_60_DAY: '60_day',
  PHASE_30_DAY: '30_day',
  PHASE_OPENING_WEEK: 'opening_week',
  PHASE_OPENING_DAY: 'opening_day',
}

export function normalizeOpeningChecklistLeague(value: string | null | undefined): OpeningChecklistLeague | null {
  if (!value) return null
  const upper = String(value).trim().toUpperCase()
  return (OPENING_CHECKLIST_LEAGUES as readonly string[]).includes(upper) ? (upper as OpeningChecklistLeague) : 'OTHER'
}

export function normalizeOpeningChecklistPhase(value: string | null | undefined): OpeningChecklistPhase {
  if (!value) return '30_day'
  if ((OPENING_CHECKLIST_PHASES as readonly string[]).includes(value)) return value as OpeningChecklistPhase
  return TWENTY_TO_DASHBOARD_PHASE[value] || '30_day'
}

export function normalizeOpeningChecklistStatus(value: string | null | undefined): OpeningChecklistStatus {
  if (!value) return 'pending'
  return (OPENING_CHECKLIST_STATUS_ORDER as readonly string[]).includes(value)
    ? (value as OpeningChecklistStatus)
    : 'pending'
}

function parseDateOnly(input: string | null | undefined): Date | null {
  if (!input) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateOnly(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function deriveDueDate(openingDate: string | null | undefined, phase: string | null | undefined): string | null {
  const parsed = parseDateOnly(openingDate)
  if (!parsed) return null
  const normalizedPhase = normalizeOpeningChecklistPhase(phase)
  const dueDate = new Date(parsed.getTime())
  dueDate.setUTCDate(dueDate.getUTCDate() - PHASE_OFFSETS[normalizedPhase])
  return formatDateOnly(dueDate)
}

function stringifyRichText(value: { markdown?: string; blocknote?: string } | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value.markdown === 'string' && value.markdown.trim()) return value.markdown.trim()
  if (typeof value.blocknote === 'string' && value.blocknote.trim()) return value.blocknote.trim()
  return null
}

function toRichText(value: string | null | undefined) {
  const text = value?.trim()
  if (!text) return null
  return { blocknote: null, markdown: text }
}

export async function getStaffLookup() {
  const localStaffResult = await query('SELECT id, full_name, role FROM staff WHERE COALESCE(is_active, true) = true ORDER BY full_name ASC')
  const twentyTechnicians = await fetchAllTwenty<TwentyTechnicianRow>('technicians')

  const localById = new Map<string, LocalStaffRow>()
  for (const row of localStaffResult.rows as LocalStaffRow[]) {
    localById.set(row.id, row)
  }

  const technicianByServicesId = new Map<string, TwentyTechnicianRow>()
  for (const tech of twentyTechnicians) {
    if (tech.servicesId) technicianByServicesId.set(tech.servicesId, tech)
  }

  return { localById, technicianByServicesId }
}

export async function resolveChecklistAssignee(localStaffId: string | null | undefined) {
  if (!localStaffId) return { technicianId: null, technicianName: null }
  const { localById, technicianByServicesId } = await getStaffLookup()
  const localStaff = localById.get(localStaffId) || null
  const technician = technicianByServicesId.get(localStaffId) || null
  return {
    technicianId: technician?.id || null,
    technicianName: technician?.name || localStaff?.full_name || null,
  }
}

export async function resolveDefaultAssigneeForVenue(venueId: string, role: OpeningChecklistTemplateSeedItem['defaultAssigneeRole']) {
  const staffResult = await query(
    `SELECT s.id, s.full_name, s.role
     FROM staff_venues sv
     JOIN staff s ON s.id = sv.staff_id
     WHERE sv.venue_id = $1 AND COALESCE(s.is_active, true) = true
     ORDER BY
       CASE WHEN s.role = $2 THEN 0 ELSE 1 END,
       CASE WHEN s.role = 'manager' THEN 0 WHEN s.role = 'tech_support' THEN 1 WHEN s.role = 'technician' THEN 2 ELSE 3 END,
       s.full_name ASC`,
    [venueId, role],
  )

  const row = (staffResult.rows as LocalStaffRow[]).find((candidate) => candidate.role === role) || (staffResult.rows as LocalStaffRow[])[0] || null
  if (!row) return { technicianId: null, technicianName: null, localStaffId: null }

  const resolved = await resolveChecklistAssignee(row.id)
  return { technicianId: resolved.technicianId, technicianName: resolved.technicianName, localStaffId: row.id }
}

export function buildOpeningChecklistPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) patch.name = String(body.name || '').trim() || null
  if (body.league !== undefined) patch.league = normalizeOpeningChecklistLeague(String(body.league || ''))
  if (body.phase !== undefined) patch.phase = DASHBOARD_TO_TWENTY_PHASE[normalizeOpeningChecklistPhase(String(body.phase || ''))]
  if (body.opening_date !== undefined) patch.openingDate = body.opening_date || null
  if (body.due_date !== undefined) patch.dueDate = body.due_date || null
  if (body.item_description !== undefined) patch.itemDescription = toRichText(String(body.item_description || ''))
  if (body.status !== undefined) patch.status = normalizeOpeningChecklistStatus(String(body.status || ''))
  if (body.notes !== undefined) patch.notes = toRichText(String(body.notes || ''))

  return patch
}

export function toTwentyOpeningChecklistPhase(phase: string | null | undefined): string {
  return DASHBOARD_TO_TWENTY_PHASE[normalizeOpeningChecklistPhase(phase)]
}

export async function shapeOpeningChecklistItem(record: TwentyOpeningChecklistItem): Promise<DashboardOpeningChecklistItem> {
  const venue = record.venue
    ? { venue_id: record.venue.servicesId || null, venue_name: record.venue.name }
    : record.venueId
    ? await twentyVenueToDashboard(record.venueId)
    : null

  const staffLookup = await getStaffLookup()
  const localAssignee = record.checklistAssignee?.servicesId
    ? (staffLookup.localById.get(record.checklistAssignee.servicesId) || null)
    : null

  return {
    id: record.id,
    venue_id: venue?.venue_id || null,
    venue_name: venue?.venue_name || null,
    name: record.name || '(untitled checklist item)',
    league: normalizeOpeningChecklistLeague(record.league),
    phase: normalizeOpeningChecklistPhase(record.phase),
    opening_date: record.openingDate || null,
    due_date: record.dueDate || null,
    item_description: stringifyRichText(record.itemDescription),
    checklist_assignee_id: localAssignee?.id || record.checklistAssignee?.servicesId || null,
    checklist_assignee_name: record.checklistAssignee?.name || localAssignee?.full_name || null,
    status: normalizeOpeningChecklistStatus(record.status),
    completed_at: record.completedAt || null,
    notes: stringifyRichText(record.notes),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

export function parseTemplateItems(value: unknown): OpeningChecklistTemplateSeedItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const entry = item as Record<string, unknown>
      const phase = normalizeOpeningChecklistPhase(String(entry.phase || '30_day'))
      const name = String(entry.name || '').trim()
      const itemDescription = String(entry.itemDescription || '').trim()
      const defaultAssigneeRole = ['technician', 'manager', 'tech_support', 'admin'].includes(String(entry.defaultAssigneeRole || ''))
        ? (String(entry.defaultAssigneeRole) as OpeningChecklistTemplateSeedItem['defaultAssigneeRole'])
        : 'technician'
      if (!name) return null
      return { phase, name, itemDescription, defaultAssigneeRole }
    })
    .filter((item): item is OpeningChecklistTemplateSeedItem => Boolean(item))
}

export function shapeOpeningChecklistTemplate(record: TwentyOpeningChecklistTemplate): DashboardOpeningChecklistTemplate {
  return {
    id: record.id,
    name: record.name || '(untitled template)',
    league: normalizeOpeningChecklistLeague(record.league),
    items: parseTemplateItems(record.items),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

export async function resolveVenueForChecklist(venueId: string | null | undefined) {
  if (!venueId) return null
  return dashboardVenueIdToTwentyId(venueId)
}
