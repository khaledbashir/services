import { NextRequest } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  DiscoveryCandidate,
  discoverForVenue,
  getActiveDiscoveryVenues,
  getDiscoveryVenue,
} from '@/lib/event-discovery'
import { writeDiscoveryLogs } from '@/lib/discovery-log'

// Stream discovery progress as Server-Sent Events so the UI can show a
// live counter ("Venue 2/5 — Prudential — found 12 events"). The final
// event carries the same payload the non-streaming endpoint returns so the
// client can reuse its existing row-rendering code.

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const venueId = typeof body.venue_id === 'string' ? body.venue_id : ''
  const allActive = body.all_active === true
  const discoveryHint = typeof body.discovery_hint === 'string' ? body.discovery_hint.trim() : ''
  const includeExisting = body.include_existing === true

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        const venues = venueId
          ? [await getDiscoveryVenue(venueId)].filter((v): v is NonNullable<typeof v> => Boolean(v))
          : allActive
            ? await getActiveDiscoveryVenues()
            : []

        if (venues.length === 0) {
          emit({ type: 'error', message: 'No venues to discover' })
          controller.close()
          return
        }

        emit({ type: 'start', total_venues: venues.length, venues: venues.map(v => ({ id: v.id, name: v.name })) })

        const allDiscovered: DiscoveryCandidate[] = []
        let totalFound = 0
        let totalDuplicates = 0
        let totalExisting = 0

        for (let i = 0; i < venues.length; i++) {
          const venue = venues[i]
          emit({ type: 'venue_start', index: i + 1, total: venues.length, venue: { id: venue.id, name: venue.name } })

          try {
            const result = await discoverForVenue(venue, discoveryHint, includeExisting)
            const found = result.discovered.length
            const dupes = result.discovered.filter(c => c.duplicate).length

            allDiscovered.push(...result.discovered)
            totalFound += found
            totalDuplicates += dupes
            totalExisting += result.existing_count || 0

            emit({
              type: 'venue_done',
              index: i + 1,
              total: venues.length,
              venue: { id: venue.id, name: venue.name },
              found,
              new: found - dupes,
              duplicates: dupes,
              running_total: allDiscovered.filter(c => !c.duplicate).length,
            })
          } catch (err) {
            emit({
              type: 'venue_error',
              index: i + 1,
              total: venues.length,
              venue: { id: venue.id, name: venue.name },
              message: err instanceof Error ? err.message : String(err),
            })
          }
        }

        const finalResult = {
          mode: venueId ? 'single' : 'bulk',
          venues: venues.map(v => ({ id: v.id, name: v.name })),
          discovered: allDiscovered,
          total_found: totalFound,
          duplicates_skipped: totalDuplicates,
          existing_count: totalExisting,
          discovery_hint: discoveryHint || null,
          include_existing: includeExisting,
        }

        await writeDiscoveryLogs({ result: finalResult }).catch(() => {})

        emit({ type: 'done', result: finalResult })
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
