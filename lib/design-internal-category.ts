// Single source of truth for the non-billable-work taxonomy Alexis named on
// 2026-04-29. Keep this list aligned across the API, the filter UI, the
// detail-page setter, and the hours-summary report — adding a new category
// in only one place will silently break the others.

export const INTERNAL_CATEGORIES = [
  { key: 'spec_sheets', label: 'Spec Sheets' },
  { key: 'ad_sales', label: 'Ad Sales' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'sponsorship', label: 'Sponsorship' },
] as const

export type InternalCategoryKey = typeof INTERNAL_CATEGORIES[number]['key']

const VALID_KEYS = new Set<string>(INTERNAL_CATEGORIES.map((c) => c.key))

export function isValidInternalCategory(key: string | null | undefined): key is InternalCategoryKey {
  return !!key && VALID_KEYS.has(key)
}

export function labelForCategory(key: string | null | undefined): string {
  if (!key) return ''
  const found = INTERNAL_CATEGORIES.find((c) => c.key === key)
  return found ? found.label : key
}
