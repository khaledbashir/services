import { computeRequiresStaffingDefault } from '@/lib/venue-automation'

export function buildClientServiceSelect(
  aliasCs: string,
  aliasSt: string,
): string {
  return `
    COUNT(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN ${aliasSt}.id END)::int as active_service_count,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN ${aliasSt}.name END), NULL), '{}') as active_service_names,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN COALESCE(${aliasSt}.description, '') END), NULL), '{}') as active_service_descriptions
  `
}

export function computeRequiresStaffingFromRow(row: {
  active_service_names?: string[] | null
  active_service_descriptions?: string[] | null
  active_service_count?: number | string | null
}): boolean {
  const count = Number(row.active_service_count || 0)
  if (count <= 0) return false
  return computeRequiresStaffingDefault({
    active_service_names: row.active_service_names || [],
    active_service_descriptions: row.active_service_descriptions || [],
  })
}
