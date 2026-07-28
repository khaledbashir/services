export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { searchLinkTargets } from '@/lib/request-hub/integrations'

// GET /api/request-hub/search-links?q= — search linkable records (local venues
// always; CRM accounts/opportunities when the CRM integration is configured).
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const q = (request.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const venueRes = await query(
    `SELECT id, name FROM venues WHERE name ILIKE $1 ORDER BY name ASC LIMIT 5`,
    [`%${q}%`]
  )
  const local = venueRes.rows.map((v) => ({ kind: 'venue', ref_id: v.id, label: v.name }))
  const external = await searchLinkTargets(q).catch(() => [])
  return NextResponse.json({ results: [...local, ...external] })
}
