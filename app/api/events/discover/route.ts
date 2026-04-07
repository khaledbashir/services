import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { discoverAcrossVenues, discoverForVenue, getActiveDiscoveryVenues, getDiscoveryVenue } from '@/lib/event-discovery'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const venueId = typeof body.venue_id === 'string' ? body.venue_id : ''
    const allActive = body.all_active === true
    const discoveryHint = typeof body.discovery_hint === 'string' ? body.discovery_hint.trim() : ''
    const includeExisting = body.include_existing === true

    if (!venueId && !allActive) {
      return NextResponse.json({ error: 'venue_id or all_active is required' }, { status: 400 })
    }

    if (venueId) {
      const venue = await getDiscoveryVenue(venueId)
      if (!venue) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
      }

      const result = await discoverForVenue(venue, discoveryHint, includeExisting)
      return NextResponse.json({
        ...result,
        mode: 'single',
        discovery_hint: discoveryHint || null,
        include_existing: includeExisting,
      })
    }

    const venues = await getActiveDiscoveryVenues()
    if (venues.length === 0) {
      return NextResponse.json({
        mode: 'bulk',
        venues: [],
        discovered: [],
        total_found: 0,
        duplicates_skipped: 0,
        existing_count: 0,
      })
    }

    const result = await discoverAcrossVenues(venues, discoveryHint, includeExisting)
    return NextResponse.json({
      ...result,
      mode: 'bulk',
      discovery_hint: discoveryHint || null,
      include_existing: includeExisting,
    })
  } catch (err) {
    console.error('Event discovery error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery failed' },
      { status: 500 }
    )
  }
}
