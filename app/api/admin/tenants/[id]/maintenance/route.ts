export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { setMaintenance, FEATURE_KEYS, FeatureKey } from '@/lib/tenants'

// POST /api/admin/tenants/:id/maintenance — flip the per-page maintenance lock.
// Body: { feature_key: string, under_maintenance: boolean }
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const featureKey = String(body.feature_key || '') as FeatureKey
  const underMaintenance = Boolean(body.under_maintenance)

  if (!FEATURE_KEYS.includes(featureKey)) {
    return NextResponse.json(
      { error: `feature_key must be one of: ${FEATURE_KEYS.join(', ')}` },
      { status: 400 },
    )
  }

  await setMaintenance(id, featureKey, underMaintenance)
  return NextResponse.json({ ok: true })
}
