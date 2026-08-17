/**
 * Canonical public address of the Service Dashboard.
 *
 * Every outbound link — Slack notifications, emails, portal invites, cron
 * digests — must be built from here. Hardcoding the hosting provider's
 * generated hostname sends stakeholders to an address that is not the product,
 * and it changes whenever the service is moved.
 *
 * Override with NEXT_PUBLIC_URL when running against a preview or local build.
 */
const CANONICAL_URL = 'https://services.ancsports.net'

function resolveBase(): string {
  const configured = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const trimmed = configured.trim()
  if (!trimmed) return CANONICAL_URL
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}

/** Base URL with no trailing slash, e.g. `https://services.ancsports.net`. */
export const DASHBOARD_URL = resolveBase()

/** Absolute dashboard URL for a path, e.g. `dashboardUrl('/tickets/42')`. */
export function dashboardUrl(path = ''): string {
  if (!path) return DASHBOARD_URL
  return `${DASHBOARD_URL}${path.startsWith('/') ? path : `/${path}`}`
}
