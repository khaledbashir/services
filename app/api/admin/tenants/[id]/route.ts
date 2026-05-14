export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// PATCH /api/admin/tenants/:id — update tenant config.
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))

  const fields: Array<[string, unknown]> = []
  const allowed = {
    name: 'text',
    brand_name: 'text',
    subdomain: 'subdomain',
    logo_url: 'text',
    primary_color: 'text',
    retainer_cap_hours: 'number',
    hourly_rate_usd: 'number',
    monthly_retainer_usd: 'number',
    warranty_days: 'number',
    payoneer_pending_url: 'text',
    payoneer_topup_url: 'text',
    contract_summary: 'text',
    is_active: 'bool',
  } as const

  for (const [key, kind] of Object.entries(allowed)) {
    if (!(key in body)) continue
    const v = body[key]
    if (kind === 'number') {
      if (v == null || v === '') continue
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) continue
      fields.push([key, n])
    } else if (kind === 'bool') {
      fields.push([key, Boolean(v)])
    } else if (kind === 'subdomain') {
      const s = String(v).trim().toLowerCase()
      if (!/^[a-z0-9-]{2,32}$/.test(s)) {
        return NextResponse.json({ error: 'subdomain must be 2-32 chars, lowercase, alphanumeric or hyphen' }, { status: 400 })
      }
      fields.push([key, s])
    } else {
      fields.push([key, v == null ? null : String(v)])
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')
  const params = [id, ...fields.map(([, v]) => v)]
  try {
    await query(
      `UPDATE tenants SET ${sets}, updated_at = NOW() WHERE id = $1`,
      params,
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'update failed' },
      { status: 500 },
    )
  }
}

// DELETE /api/admin/tenants/:id — soft-archive (sets is_active=false, archived_at=NOW()).
// Hard-delete the ANC tenant is blocked to prevent accidents.
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await ctx.params
  const url = new URL(request.url)
  const hard = url.searchParams.get('hard') === 'true'

  const slugRes = await query(`SELECT slug FROM tenants WHERE id = $1`, [id])
  const slug = slugRes.rows[0]?.slug as string | undefined
  if (slug === 'anc') {
    return NextResponse.json({ error: 'the ANC tenant cannot be deleted' }, { status: 400 })
  }

  if (hard) {
    await query(`DELETE FROM tenants WHERE id = $1`, [id])
  } else {
    await query(
      `UPDATE tenants SET is_active = false, archived_at = NOW() WHERE id = $1`,
      [id],
    )
  }
  return NextResponse.json({ ok: true })
}
