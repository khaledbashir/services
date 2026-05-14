export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { listTenants, FEATURE_KEYS } from '@/lib/tenants'

// GET /api/admin/tenants — list all tenants (admin-only).
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const tenants = await listTenants()
  const featRes = await query(
    `SELECT tenant_id::text, feature_key, enabled FROM tenant_features`,
  )
  const features = new Map<string, Record<string, boolean>>()
  for (const row of featRes.rows) {
    const tid = String(row.tenant_id)
    if (!features.has(tid)) features.set(tid, {})
    features.get(tid)![row.feature_key as string] = Boolean(row.enabled)
  }
  return NextResponse.json({
    tenants: tenants.map((t) => ({
      ...t,
      features: features.get(t.id) || {},
    })),
    feature_keys: FEATURE_KEYS,
  })
}

// POST /api/admin/tenants — create a tenant.
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const slug = String(body.slug || '').trim().toLowerCase()
  const subdomain = String(body.subdomain || slug).trim().toLowerCase()
  const name = String(body.name || '').trim()

  if (!/^[a-z0-9-]{2,32}$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be 2-32 chars, lowercase, alphanumeric or hyphen' }, { status: 400 })
  }
  if (!/^[a-z0-9-]{2,32}$/.test(subdomain)) {
    return NextResponse.json({ error: 'subdomain must be 2-32 chars, lowercase, alphanumeric or hyphen' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  try {
    const r = await query(
      `INSERT INTO tenants
         (slug, subdomain, name, brand_name, retainer_cap_hours, hourly_rate_usd,
          monthly_retainer_usd, warranty_days)
         VALUES ($1, $2, $3, COALESCE($4, $3),
                 COALESCE($5, 12), COALESCE($6, 90),
                 COALESCE($7, 1500), COALESCE($8, 30))
         RETURNING id::text`,
      [
        slug,
        subdomain,
        name,
        body.brand_name || null,
        Number.isFinite(Number(body.retainer_cap_hours)) ? Number(body.retainer_cap_hours) : null,
        Number.isFinite(Number(body.hourly_rate_usd)) ? Number(body.hourly_rate_usd) : null,
        Number.isFinite(Number(body.monthly_retainer_usd)) ? Number(body.monthly_retainer_usd) : null,
        Number.isFinite(Number(body.warranty_days)) ? Number(body.warranty_days) : null,
      ],
    )
    const newId = r.rows[0].id
    // Seed all features as enabled by default.
    await query(
      `INSERT INTO tenant_features (tenant_id, feature_key, enabled)
         SELECT $1, k, true FROM unnest($2::text[]) AS k
         ON CONFLICT (tenant_id, feature_key) DO NOTHING`,
      [newId, FEATURE_KEYS as unknown as string[]],
    )
    return NextResponse.json({ id: newId }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'create failed' },
      { status: 500 },
    )
  }
}
