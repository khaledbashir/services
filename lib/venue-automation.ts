import { query } from '@/lib/db'

export interface VenueAutomationInfo {
  active_service_count: number
  active_service_names: string[]
  active_service_descriptions: string[]
  requires_staffing_default: boolean
}

function serviceText(name: string, description: string): string {
  return `${name} ${description}`.toLowerCase()
}

function serviceMetadataRequiresStaffing(name: string, description: string): boolean {
  const text = serviceText(name, description)

  const passiveSignals = [
    'warranty',
    'maintenance',
    'monitoring',
    'remote',
    'on-call',
    'on call',
    'no on-site',
    'no onsite',
    'content update',
    'content management',
  ]

  const staffedSignals = [
    'full service',
    'on-site',
    'onsite',
    'operation',
    'operator',
    'camera',
    'video',
    'audio',
    'lighting',
    'scoring',
    'technical support',
    'setup',
    'production',
  ]

  if (passiveSignals.some((signal) => text.includes(signal)) && !staffedSignals.some((signal) => text.includes(signal))) {
    return false
  }

  if (staffedSignals.some((signal) => text.includes(signal))) {
    return true
  }

  return true
}

export function computeRequiresStaffingDefault(params: {
  active_service_names?: string[] | null
  active_service_descriptions?: string[] | null
}): boolean {
  const names = params.active_service_names || []
  const descriptions = params.active_service_descriptions || []

  return names.some((name, index) =>
    serviceMetadataRequiresStaffing(name || '', descriptions[index] || '')
  )
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
}>(row: T): T & VenueAutomationInfo {
  const active_service_count = Number(row.active_service_count || 0)
  const active_service_names = row.active_service_names || []
  const active_service_descriptions = row.active_service_descriptions || []

  return {
    ...row,
    active_service_count,
    active_service_names,
    active_service_descriptions,
    requires_staffing_default: computeRequiresStaffingDefault({
      active_service_names,
      active_service_descriptions,
    }),
  }
}

export async function getVenueAutomationInfo(venueId: string): Promise<VenueAutomationInfo> {
  const result = await query(
    `SELECT
       ${buildAutomationSelect('v', 'vs', 'st')}
     FROM venues v
     LEFT JOIN venue_services vs ON vs.venue_id = v.id
     LEFT JOIN service_types st ON st.id = vs.service_type_id
     WHERE v.id = $1
     GROUP BY v.id`,
    [venueId]
  )

  const row = result.rows[0] || {
    active_service_count: 0,
    active_service_names: [],
    active_service_descriptions: [],
  }

  return withComputedAutomation(row)
}
