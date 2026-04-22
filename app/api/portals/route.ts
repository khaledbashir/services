import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  buildClientPortalUrl,
  createClientPortal,
  getVenueForPortal,
  listClientPortalsForVenue,
} from '@/lib/client-portals'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const venueId = new URL(request.url).searchParams.get('venue_id')
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    const venue = await getVenueForPortal(venueId)
    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const portals = await listClientPortalsForVenue(venueId)
    const origin = request.nextUrl.origin

    return NextResponse.json({
      venue,
      portals: portals.map((portal) => ({
        ...portal,
        share_url: buildClientPortalUrl(origin, portal.token),
      })),
    })
  } catch (error) {
    console.error('[portals GET] error:', error)
    return NextResponse.json({ error: 'Failed to load client portals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const venueId = String(body.venue_id || '')
    const expiresAt = body.expires_at ? String(body.expires_at) : null

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    const created = await createClientPortal({
      venueId,
      createdByEmail: auth.email,
      expiresAt,
    })

    return NextResponse.json({
      portal: {
        ...created.portal,
        share_url: buildClientPortalUrl(request.nextUrl.origin, created.portal.token),
      },
      venue: created.venue,
    })
  } catch (error) {
    console.error('[portals POST] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create client portal' },
      { status: 500 }
    )
  }
}
