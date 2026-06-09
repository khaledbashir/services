export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getPortalUserVenueIds } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    const venues = venueIds.length
      ? (await query(
          `SELECT id, name FROM venues WHERE id = ANY($1::uuid[]) ORDER BY name`,
          [venueIds]
        )).rows
      : []

    return NextResponse.json({ user: session, venues })
  } catch (err) {
    console.error('Portal me error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
