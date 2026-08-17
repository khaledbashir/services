import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'
import { dashboardUrl } from '@/lib/app-url'
import { DiscoveryCandidate, getDiscoveryVenue, importDiscoveryEvents } from '@/lib/event-discovery'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const defaultVenueId = typeof body.venue_id === 'string' ? body.venue_id : undefined
    const status = body.status === 'imported' ? 'imported' : 'confirmed'
    const events = (Array.isArray(body.events) ? body.events : []) as DiscoveryCandidate[]

    if ((!defaultVenueId && events.some(event => !event.venue_id)) || events.length === 0) {
      return NextResponse.json({ error: 'events array is required and every row needs a venue_id or top-level venue_id' }, { status: 400 })
    }

    const result = await importDiscoveryEvents({
      defaultVenueId,
      events,
      status,
    })

    if (result.imported > 0) {
      if (defaultVenueId) {
        const venue = await getDiscoveryVenue(defaultVenueId)
        if (venue) {
          notifyOps(
            ':mag:',
            `*AI Event Discovery:* ${result.imported} events imported for *${venue.name}*`,
            { label: 'View Venue', url: dashboardUrl(`/venues/${defaultVenueId}`) },
            venue.slack_channel_id || undefined
          )
        }
      } else {
        notifyOps(
          ':mag:',
          `*AI Event Discovery:* ${result.imported} events imported across ${Object.keys(result.byVenue).length} venues`,
          { label: 'View Events', url: dashboardUrl('/events') }
        )
      }
    }

    return NextResponse.json({
      imported: result.imported,
      skipped: result.skipped,
      event_ids: result.eventIds,
      by_venue: result.byVenue,
      status,
    })
  } catch (err) {
    console.error('Event import error:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
