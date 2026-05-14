import { headers } from 'next/headers'
import { query } from './db'

export interface Tenant {
  id: string
  slug: string
  subdomain: string
  name: string
  brand_name: string | null
  logo_url: string | null
  primary_color: string | null
  retainer_cap_hours: number
  hourly_rate_usd: number
  monthly_retainer_usd: number
  warranty_days: number
  payoneer_pending_url: string | null
  payoneer_topup_url: string | null
  contract_summary: string | null
  is_active: boolean
  page_maintenance: Record<string, boolean>
}

export const FEATURE_KEYS = [
  'transparency',
  'change_orders',
  'explore',
  'morning_brief',
  'service_log',
  'expenses',
  'advisor',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

function rowToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    slug: String(row.slug),
    subdomain: String(row.subdomain),
    name: String(row.name),
    brand_name: (row.brand_name as string) ?? null,
    logo_url: (row.logo_url as string) ?? null,
    primary_color: (row.primary_color as string) ?? null,
    retainer_cap_hours: Number(row.retainer_cap_hours) || 12,
    hourly_rate_usd: Number(row.hourly_rate_usd) || 90,
    monthly_retainer_usd: Number(row.monthly_retainer_usd) || 1500,
    warranty_days: Number(row.warranty_days) || 30,
    payoneer_pending_url: (row.payoneer_pending_url as string) ?? null,
    payoneer_topup_url: (row.payoneer_topup_url as string) ?? null,
    contract_summary: (row.contract_summary as string) ?? null,
    is_active: Boolean(row.is_active),
    page_maintenance: (row.page_maintenance as Record<string, boolean>) || {},
  }
}

// Pulls the subdomain out of the request host. Defaults to 'anc' when
// the host doesn't have a subdomain (root domain), so ANC stays as the
// fallback tenant — nothing breaks for existing services.ancsports.net.
function subdomainFromHost(host: string | null): string {
  if (!host) return 'anc'
  const bare = host.replace(/:\d+$/, '').toLowerCase()
  const parts = bare.split('.')
  if (parts.length < 3) return 'anc'
  return parts[0]
}

// Read the tenant for the current request. Server-component safe — uses
// next/headers. Returns null only if the database is empty (no ANC tenant
// seeded), which would mean a fresh install.
export async function getTenantFromHost(): Promise<Tenant | null> {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const sub = subdomainFromHost(host)

  let r = await query(
    `SELECT * FROM tenants
      WHERE (subdomain = $1 OR slug = $1)
        AND is_active = true
      LIMIT 1`,
    [sub],
  )
  if (r.rows.length === 0) {
    r = await query(
      `SELECT * FROM tenants WHERE slug = 'anc' AND is_active = true LIMIT 1`,
    )
  }
  if (r.rows.length === 0) return null
  return rowToTenant(r.rows[0])
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const r = await query(`SELECT * FROM tenants WHERE slug = $1 LIMIT 1`, [slug])
  if (r.rows.length === 0) return null
  return rowToTenant(r.rows[0])
}

export async function listTenants(): Promise<Tenant[]> {
  const r = await query(
    `SELECT * FROM tenants ORDER BY is_active DESC, name ASC`,
  )
  return r.rows.map(rowToTenant)
}

// Feature flags ----------------------------------------------------------
export async function getEnabledFeatures(tenantId: string): Promise<Set<FeatureKey>> {
  const r = await query(
    `SELECT feature_key FROM tenant_features
      WHERE tenant_id = $1 AND enabled = true`,
    [tenantId],
  )
  return new Set<FeatureKey>(r.rows.map((row) => row.feature_key as FeatureKey))
}

export async function setFeature(
  tenantId: string,
  key: FeatureKey,
  enabled: boolean,
): Promise<void> {
  await query(
    `INSERT INTO tenant_features (tenant_id, feature_key, enabled, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, feature_key)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [tenantId, key, enabled],
  )
}

// setMaintenance flips the per-page maintenance lock for a tenant. When
// true, non-admin viewers of that page see a maintenance card; admins
// still see the live page.
export async function setMaintenance(
  tenantId: string,
  key: FeatureKey,
  underMaintenance: boolean,
): Promise<void> {
  await query(
    `UPDATE tenants
        SET page_maintenance = COALESCE(page_maintenance, '{}'::jsonb) || jsonb_build_object($2::text, $3::boolean),
            updated_at = NOW()
      WHERE id = $1`,
    [tenantId, key, underMaintenance],
  )
}
