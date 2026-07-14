export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { isAuthError, requireRole } from '@/lib/rbac'
import { ensureHubTables } from '@/lib/hub'
import { query } from '@/lib/db'

export type Login = { platform: string; url?: string; email?: string; password?: string; note?: string }

/**
 * POST /api/hub/tokens — mint a Leadership Hub access link.
 *
 * Admin-only. Creates a hub_access_tokens row and returns the shareable URL.
 * Use personName "Leadership" for the shared leadership link (the hub greets
 * that name generically instead of "Good evening, Leadership.").
 *
 * Body: { personName, personEmail, logins?: Login[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const personName = String(body.personName ?? '').replace(/\s+/g, ' ').trim()
    const personEmail = String(body.personEmail ?? '').replace(/\s+/g, ' ').trim()
    if (!personName || !personEmail) {
      return NextResponse.json({ error: 'personName and personEmail are required.' }, { status: 400 })
    }

    const logins: Login[] = Array.isArray(body.logins) ? body.logins : []
    const token = randomBytes(18).toString('hex')

    await ensureHubTables()
    await query(
      `INSERT INTO hub_access_tokens (token, person_name, person_email, logins)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [token, personName, personEmail, JSON.stringify(logins)],
    )

    const origin = request.nextUrl.origin
    return NextResponse.json({
      data: { token, url: `${origin}/hub/${token}`, personName, personEmail },
    })
  } catch (err) {
    console.error('Error minting hub token:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/hub/tokens — list active hub links (admin-only, token values redacted).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    await ensureHubTables()
    const res = await query(
      `SELECT token, person_name, person_email, view_count, last_viewed_at, created_at, revoked_at
       FROM hub_access_tokens ORDER BY created_at DESC`,
    )
    const origin = request.nextUrl.origin
    return NextResponse.json({
      data: res.rows.map((r: any) => ({
        url: `${origin}/hub/${r.token}`,
        personName: r.person_name,
        personEmail: r.person_email,
        viewCount: r.view_count,
        lastViewedAt: r.last_viewed_at,
        createdAt: r.created_at,
        revokedAt: r.revoked_at,
      })),
    })
  } catch (err) {
    console.error('Error listing hub tokens:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}