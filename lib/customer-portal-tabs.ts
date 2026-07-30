export const CUSTOMER_PORTAL_TABS = [
  { key: 'overview', label: 'Overview', href: '/customer', exact: true },
  { key: 'requests', label: 'Requests', href: '/customer/requests', exact: false },
  { key: 'displays', label: 'Service Health', href: '/customer/displays', exact: false },
  { key: 'diagnosis', label: 'AI Diagnosis', href: '/customer/diagnosis', exact: false },
  { key: 'documents', label: 'Documents', href: '/customer/documents', exact: false },
  { key: 'approvals', label: 'Approvals', href: '/customer/approvals', exact: false },
  { key: 'reports', label: 'Reports', href: '/customer/reports', exact: false },
  { key: 'orientation', label: 'Orientation', href: '/customer/orientation', exact: false },
] as const

export type CustomerPortalTabKey = typeof CUSTOMER_PORTAL_TABS[number]['key']

export const DEFAULT_CUSTOMER_PORTAL_TABS: CustomerPortalTabKey[] = ['overview', 'requests']

const allowedTabs = new Set<string>(CUSTOMER_PORTAL_TABS.map((tab) => tab.key))

export function normalizeCustomerPortalTabs(value: unknown): CustomerPortalTabKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_CUSTOMER_PORTAL_TABS]
  const selected = new Set(
    value.filter((item): item is CustomerPortalTabKey => typeof item === 'string' && allowedTabs.has(item))
  )
  return CUSTOMER_PORTAL_TABS
    .map((tab) => tab.key)
    .filter((key) => selected.has(key))
}

export function portalTabForPath(pathname: string): CustomerPortalTabKey | null {
  const match = CUSTOMER_PORTAL_TABS.find((tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  )
  return match?.key ?? null
}
