export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  getHubConfig,
  setHubConfigKey,
  isHubConfigKey,
  DEFAULT_CONFIG,
} from '@/lib/request-hub/config'

// GET /api/request-hub/admin/config — full effective config + defaults +
// change history (audit trail of config edits).
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const config = await getHubConfig()
  const overrides = await query(
    `SELECT key, updated_by_name, updated_at FROM request_hub_config ORDER BY updated_at DESC`
  )
  return NextResponse.json({ config, defaults: DEFAULT_CONFIG, overrides: overrides.rows })
}

// PUT /api/request-hub/admin/config — { key, value } (value = null resets to default)
export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => null)
  const key = String(body?.key || '')
  if (!isHubConfigKey(key)) {
    return NextResponse.json({ error: `Unknown config key: ${key}` }, { status: 400 })
  }

  if (body.value === null) {
    await query(`DELETE FROM request_hub_config WHERE key = $1`, [key])
  } else {
    await setHubConfigKey(key, body.value, { userId: auth.userId, fullName: auth.fullName })
  }

  // Config changes are important decisions — audit them in a durable place.
  // request_hub_activity is per-request, so config edits get their own log row
  // keyed on the config table itself via updated_by/updated_at (already stored)
  // plus a console breadcrumb for ops.
  console.log(`[request-hub] config "${key}" ${body.value === null ? 'reset' : 'updated'} by ${auth.fullName}`)

  const config = await getHubConfig()
  return NextResponse.json({ config })
}
