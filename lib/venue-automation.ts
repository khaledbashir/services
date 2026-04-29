import { query } from '@/lib/db'

export interface VenueAutomationInfo {
  active_service_count: number
  active_service_names: string[]
  active_service_descriptions: string[]
  requires_staffing_default: boolean
  venue_type?: string | null
}

// Joe's 2026-04-29 follow-up: stop inferring per-event staffing from a
// venue's contracted services. The venue-level `requires_assignment` toggle
// is the single source of truth — per-event exceptions go through
// `events.requires_staffing` (null = use the venue default).
export function computeRequiresStaffingDefault(params: {
  requires_assignment?: boolean | null
}): boolean {
  return params.requires_assignment !== false
}

export function classifyVenueAutomationStatus(params: {
  is_active: boolean
  active_service_count: number
  feed_url?: string | null
}): 'auto_sync_active' | 'no_services' | 'no_feed_url' | 'inactive' {
  if (!params.is_active) return 'inactive'
  if (params.active_service_count <= 0) return 'no_services'
  if (!params.feed_url) return 'no_feed_url'
  return 'auto_sync_active'
}

export function buildAutomationSelect(aliasV: string, aliasVs: string, aliasSt: string): string {
  return `
    COUNT(DISTINCT CASE WHEN ${aliasVs}.enabled = true THEN ${aliasSt}.id END)::int as active_service_count,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasVs}.enabled = true THEN ${aliasSt}.name END), NULL), '{}') as active_service_names,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasVs}.enabled = true THEN COALESCE(${aliasSt}.description, '') END), NULL), '{}') as active_service_descriptions
  `
}

export function withComputedAutomation<T extends {
  active_service_count?: number | string
  active_service_names?: string[]
  active_service_descriptions?: string[]
  venue_type?: string | null
  requires_assignment?: boolean | null
}>(row: T): T & VenueAutomationInfo {
  const active_service_count = Number(row.active_service_count || 0)
  const active_service_names = row.active_service_names || []
  const active_service_descriptions = row.active_service_descriptions || []

  return {
    ...row,
    active_service_count,
    active_service_names,
    active_service_descriptions,
    venue_type: row.venue_type ?? null,
    requires_staffing_default: computeRequiresStaffingDefault({
      requires_assignment: row.requires_assignment,
    }),
  }
}

export async function getVenueAutomationInfo(venueId: string): Promise<VenueAutomationInfo> {
  const result = await query(
    `SELECT
       COALESCE(v.venue_type, 'sports') as venue_type,
       COALESCE(v.requires_assignment, true) as requires_assignment,
       ${buildAutomationSelect('v', 'vs', 'st')}
     FROM venues v
     LEFT JOIN client_venues cv ON cv.venue_id = v.id
     LEFT JOIN client_services vs ON vs.client_id = cv.client_id
     LEFT JOIN service_types st ON st.id = vs.service_type_id
     WHERE v.id = $1
     GROUP BY v.id`,
    [venueId]
  )

  const row = result.rows[0] || {
    active_service_count: 0,
    active_service_names: [],
    active_service_descriptions: [],
    requires_assignment: true,
  }

  return withComputedAutomation(row)
}
