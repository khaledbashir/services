import { NextRequest } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  DiscoveryCandidate,
  DiscoveryProgress,
  discoverForVenue,
  getActiveDiscoveryVenues,
  getDiscoveryConcurrency,
  getDiscoveryVenue,
  importDiscoveryEvents,
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
        let completedCount = 0

        // Process venues in parallel. With a single provider we stick to 3
        // (Ollama rate-limit friendly). With multiple providers we scale up
        // — each added provider buys us 3 more concurrent slots without
        // hammering any single rate limit.
        const CONCURRENCY = getDiscoveryConcurrency()
        const runVenue = async (venue: typeof venues[number], idx: number) => {
          const index = idx + 1
          emit({ type: 'venue_start', index, total: venues.length, venue: { id: venue.id, name: venue.name } })
          try {
            const onProgress: DiscoveryProgress = (step, detail) => {
              emit({
                type: 'venue_step',
                index,
                total: venues.length,
                venue: { id: venue.id, name: venue.name },
                step,
                detail: detail || {},
              })
            }
            const result = await discoverForVenue(venue, discoveryHint, includeExisting, onProgress)
            const found = result.discovered.length
            const dupes = result.discovered.filter(c => c.duplicate).length
            const toImport = result.discovered.filter(c => !c.duplicate)

            // Immediate import: as soon as a venue finishes discovery, push
            // its non-duplicate candidates into the events table so the
            // calendar UI repopulates live instead of waiting for the full
            // 55-venue run to finish.
            let importedCount = 0
            if (toImport.length > 0) {
              try {
                const imp = await importDiscoveryEvents({
                  defaultVenueId: venue.id,
                  events: toImport,
                  status: 'imported',
                })
                importedCount = imp.imported
              } catch (err) {
                // Import failure shouldn't kill the whole run — surface via
                // the venue_error channel later.
                console.error('Live import failed for venue', venue.name, err)
              }
            }

            // Write a per-venue row to discovery_log NOW (not at end of run)
            // so the audit page reflects progress in real time and captures
            // the correct imported count for each venue.
            await writeDiscoveryLogs({
              result: {
                venues: [{ id: venue.id, name: venue.name }],
                discovered: result.discovered,
                total_found: found,
                duplicates_skipped: dupes,
                existing_count: result.existing_count || 0,
                discovery_hint: discoveryHint || null,
                include_existing: includeExisting,
              },
              importedByVenue: { [venue.id]: importedCount },
            }).catch((err) => console.error('writeDiscoveryLogs failed for', venue.name, err))

            allDiscovered.push(...result.discovered)
            totalFound += found
            totalDuplicates += dupes
            totalExisting += result.existing_count || 0
            completedCount += 1

            emit({
              type: 'venue_done',
              index,
              total: venues.length,
              completed: completedCount,
              venue: { id: venue.id, name: venue.name },
              found,
              new: found - dupes,
              duplicates: dupes,
              imported: importedCount,
              running_total: allDiscovered.filter(c => !c.duplicate).length,
            })
          } catch (err) {
            completedCount += 1
            emit({
              type: 'venue_error',
              index,
              total: venues.length,
              completed: completedCount,
              venue: { id: venue.id, name: venue.name },
              message: err instanceof Error ? err.message : String(err),
            })
          }
        }

        // Pool-based concurrency: always keep CONCURRENCY workers busy.
        let cursor = 0
        const workers = Array.from({ length: Math.min(CONCURRENCY, venues.length) }, async () => {
          while (cursor < venues.length) {
            const idx = cursor++
            await runVenue(venues[idx], idx)
          }
        })
        await Promise.all(workers)

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

        // Per-venue logs already written above during the run; skip the
        // end-of-run bulk write to avoid duplicate entries.

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
