export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'

const ALLOWED_PREFERENCE_KEYS = new Set([
  'customerPortal.selectedVenueId',
  'customerPortal.ticketPanel',
])

function readPreferenceKey(request: NextRequest): string | null {
  const key = request.nextUrl.searchParams.get('key')?.trim() || ''
  return ALLOWED_PREFERENCE_KEYS.has(key) ? key : null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = readPreferenceKey(request)
    if (!key) {
      return NextResponse.json({ error: 'Unsupported preference key' }, { status: 400 })
    }

    const result = await query(
      `SELECT value
       FROM portal_user_preferences
       WHERE portal_user_id = $1 AND key = $2`,
      [session.portalUserId, key]
    )
    return NextResponse.json({ value: result.rows[0]?.value ?? null })
  } catch (error) {
    console.error('Customer UI preference read error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    const value = typeof body.value === 'string' ? body.value : String(body.value ?? '')
    if (!ALLOWED_PREFERENCE_KEYS.has(key)) {
      return NextResponse.json({ error: 'Unsupported preference key' }, { status: 400 })
    }
    if (!value || value.length > 2048) {
      return NextResponse.json({ error: 'Invalid preference value' }, { status: 400 })
    }

    await query(
      `INSERT INTO portal_user_preferences (portal_user_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (portal_user_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [session.portalUserId, key, value]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Customer UI preference write error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
