import { query } from '@/lib/db'
import type { DiscoveryBatchResult, DiscoveryCandidate } from '@/lib/event-discovery'

type DiscoveryLogStatus = 'success' | 'partial' | 'failed'

function summarizeSources(events: DiscoveryCandidate[]): string {
  const sources = [...new Set(events.map((event) => event.source || 'ai_discovery').filter(Boolean))]
  return sources.length > 0 ? sources.join(',') : 'none'
}

function statusForVenueRun(events: DiscoveryCandidate[], importedCount: number): DiscoveryLogStatus {
  if (events.length === 0) return 'success'
  if (importedCount === 0 && events.some((event) => event.duplicate)) return 'partial'
  if (importedCount > 0 && importedCount < events.filter((event) => !event.duplicate).length) return 'partial'
  return 'success'
}

export async function writeDiscoveryLogs(params: {
  result: DiscoveryBatchResult
  importedByVenue?: Record<string, number>
  statusOverride?: DiscoveryLogStatus
  failureError?: unknown
  triggeredByUserId?: string | null
  trigger?: 'manual' | 'cron' | 'auto_save' | 'api'
}) {
  const triggeredBy = params.triggeredByUserId || null
  const trigger = params.trigger || 'manual'
  const importedByVenue = params.importedByVenue || {}
  const eventsByVenue = new Map<string, DiscoveryCandidate[]>()

  for (const event of params.result.discovered || []) {
    const current = eventsByVenue.get(event.venue_id) || []
    current.push(event)
    eventsByVenue.set(event.venue_id, current)
  }

  const venueRows = params.result.venues || []

  if (venueRows.length === 0 && params.statusOverride === 'failed') {
    await query(
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response, triggered_by_user_id, trigger)
       VALUES (NULL, NOW(), $1, $2, $3, $4, $5, $6, $7)`,
      [
        'system',
        0,
        0,
        'failed',
        JSON.stringify({
          error: params.failureError instanceof Error ? params.failureError.message : String(params.failureError || 'Unknown error'),
          result: params.result,
        }),
        triggeredBy,
        trigger,
      ]
    )
    return
  }

  for (const venue of venueRows) {
    const venueEvents = eventsByVenue.get(venue.id) || []
    const importedCount = importedByVenue[venue.id] || 0
    const source = summarizeSources(venueEvents)
    const status = params.statusOverride || statusForVenueRun(venueEvents, importedCount)

    await query(
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response, triggered_by_user_id, trigger)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
      [
        venue.id,
        source,
        venueEvents.length,
        importedCount,
        status,
        JSON.stringify({
          venue,
          discovery_hint: params.result.discovery_hint || null,
          include_existing: params.result.include_existing || false,
          events: venueEvents,
          imported_count: importedCount,
        }),
        triggeredBy,
        trigger,
      ]
    )
  }
}
