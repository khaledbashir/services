export const CUSTOMER_PORTAL_TABS = [
  { key: 'overview', label: 'Overview', href: '/customer', exact: true },
  { key: 'requests', label: 'Requests', href: '/customer/requests', exact: false },
  { key: 'events', label: 'Events', href: '/customer/events', exact: false },
  { key: 'displays', label: 'Service Health', href: '/customer/displays', exact: false },
  { key: 'diagnosis', label: 'AI Diagnosis', href: '/customer/diagnosis', exact: false },
  { key: 'designs', label: 'Design Requests', href: '/customer/designs', exact: false },
  { key: 'documents', label: 'Documents', href: '/customer/documents', exact: false },
  { key: 'approvals', label: 'Approvals', href: '/customer/approvals', exact: false },
  { key: 'reports', label: 'Reports', href: '/customer/reports', exact: false },
  { key: 'orientation', label: 'Orientation', href: '/customer/orientation', exact: false },
  { key: 'assistant', label: 'ANC Assistant', href: '/customer/assistant', exact: false },
] as const

/**
 * Tabs staff can switch on for an account but which clients must not reach yet.
 * Charlie 2026-08-10 on the assistant: "We don't want clients using it yet till
 * we fine tune it." The option is selectable in the portal setup so the account
 * is ready, and the page itself refuses to serve clients until this is cleared.
 */
export const CUSTOMER_PORTAL_TABS_PENDING_APPROVAL: readonly string[] = ['assistant']

export function isCustomerPortalTabPendingApproval(key: string): boolean {
  return CUSTOMER_PORTAL_TABS_PENDING_APPROVAL.includes(key)
}

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
