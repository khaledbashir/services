import { query } from '@/lib/db'
import { importDiscoveryEvents, type DiscoveryCandidate } from '@/lib/event-discovery'
import { parseVenueFeed, type FeedEvent, type FeedType } from '@/lib/feed-parsers'

export interface FeedVenue {
  id: string
  name: string
  address: string | null
  feed_url: string
  feed_type: FeedType
  active_service_count: number
}

interface ExistingEventRow {
  id: string
  summary: string
  event_date: string
  start_time: string | null
}

function normalizeSummary(summary: string): string {
  return (summary || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeWords(summary: string): string[] {
  return (summary || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function wordSimilarity(a: string, b: string): number {
  const aWords = new Set(normalizeWords(a))
  const bWords = new Set(normalizeWords(b))
  if (aWords.size === 0 || bWords.size === 0) return 0
  let overlap = 0
  for (const word of aWords) {
    if (bWords.has(word)) overlap++
  }
  return overlap / Math.max(aWords.size, bWords.size)
}

function normalizeTimeForKey(time: string | null): string | null {
  if (!time) return null
  const match = time.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : null
}

async function loadExistingEvents(venueId: string, startDate: string, endDate: string): Promise<ExistingEventRow[]> {
  const result = await query(
    `SELECT id,
            summary,
            TO_CHAR(event_date, 'YYYY-MM-DD') as event_date,
            TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH24:MI') as start_time
     FROM events
     WHERE venue_id = $1
       AND event_date >= $2
       AND event_date <= $3`,
    [venueId, startDate, endDate]
  )
  return result.rows
}

function findDuplicate(candidate: DiscoveryCandidate, existingEvents: ExistingEventRow[]): { duplicate: boolean; reason: string | null } {
  const normalizedSummary = normalizeSummary(candidate.summary)
  const normalizedTime = normalizeTimeForKey(candidate.start_time)

  for (const existing of existingEvents) {
    if (existing.event_date !== candidate.event_date) continue

    if (normalizedTime && existing.start_time && normalizeTimeForKey(existing.start_time) === normalizedTime) {
      return { duplicate: true, reason: 'Same date and start time already exists' }
    }

    if (normalizeSummary(existing.summary) === normalizedSummary) {
      return { duplicate: true, reason: 'Same date and summary already exists' }
    }

    if (wordSimilarity(existing.summary, candidate.summary) >= 0.8) {
      return { duplicate: true, reason: 'Similar event already exists on this date' }
    }
  }

  return { duplicate: false, reason: null }
}

function feedEventToCandidate(feedEvent: FeedEvent, venue: FeedVenue): DiscoveryCandidate {
  const matchType = feedEvent.source === 'other' ? 'ai_inferred' : 'official_source'
  const trustScore = matchType === 'official_source'
    ? Math.max(feedEvent.confidence, 0.9)
    : Math.max(Math.min(feedEvent.confidence, 0.82), 0.68)

  return {
    venue_id: venue.id,
    venue_name: venue.name,
    summary: feedEvent.name,
    event_date: feedEvent.date,
    start_time: feedEvent.time,
    end_time: null,
    event_type: feedEvent.eventType,
    league: feedEvent.league,
    home_team: feedEvent.teams[1] || null,
    away_team: feedEvent.teams[0] || null,
    source_url: feedEvent.sourceUrl || venue.feed_url,
    source_domain: (() => {
      try {
        return new URL(feedEvent.sourceUrl || venue.feed_url).hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        return null
      }
    })(),
    source_label: feedEvent.sourceLabel || feedEvent.source,
    source_kind: feedEvent.source,
    source: feedEvent.source,
    match_type: matchType,
    matched_query: `feed:${venue.feed_type}`,
    evidence_snippet: feedEvent.evidenceSnippet || `${feedEvent.name} from ${venue.feed_url}`,
    confidence: feedEvent.confidence,
    trust_score: trustScore,
    trust_reasons: [
      `Pulled from configured ${venue.feed_type} feed`,
      `Feed URL: ${venue.feed_url}`,
    ],
    duplicate: false,
    duplicate_reason: null,
    requires_staffing: venue.active_service_count > 0,
    status: 'discovered',
    auto_importable: matchType === 'official_source' && trustScore >= 0.9,
  }
}

export async function getFeedSyncVenues(): Promise<FeedVenue[]> {
  const result = await query(
    `SELECT
       v.id,
       v.name,
       v.address,
       v.feed_url,
       COALESCE(v.feed_type, 'other') as feed_type,
       COUNT(CASE WHEN vs.enabled = true THEN 1 END)::int as active_service_count
     FROM venues v
     LEFT JOIN venue_services vs ON vs.venue_id = v.id
     WHERE COALESCE(v.feed_url, '') <> ''
     GROUP BY v.id
     ORDER BY v.name`
  )
  return result.rows
}

export async function syncVenueFeed(venue: FeedVenue): Promise<{
  venue: FeedVenue
  discovered: DiscoveryCandidate[]
  imported: number
  skipped: number
  status: 'success' | 'partial' | 'failed'
  error?: string
}> {
  const today = new Date().toISOString().split('T')[0]
  const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  try {
    const parsedEvents = await parseVenueFeed(venue.feed_type, {
      venueName: venue.name,
      feedUrl: venue.feed_url,
    })

    const windowedEvents = parsedEvents.filter((event) => event.date >= today && event.date <= ninetyDaysOut)
    const existingEvents = await loadExistingEvents(venue.id, today, ninetyDaysOut)
    const discovered = windowedEvents.map((event) => {
      const candidate = feedEventToCandidate(event, venue)
      const duplicate = findDuplicate(candidate, existingEvents)
      return {
        ...candidate,
        duplicate: duplicate.duplicate,
        duplicate_reason: duplicate.reason,
      }
    })

    const autoImportable = discovered.filter((event) => !event.duplicate && event.auto_importable)
    const imported = autoImportable.length > 0
      ? await importDiscoveryEvents({ events: autoImportable, status: 'imported' })
      : { imported: 0, skipped: 0, eventIds: [], byVenue: {} as Record<string, number> }

    const status = discovered.length === 0
      ? 'success'
      : imported.imported === 0 && discovered.some((event) => event.duplicate)
        ? 'partial'
        : imported.imported < discovered.filter((event) => !event.duplicate).length
          ? 'partial'
          : 'success'

    await query(
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
      [
        venue.id,
        `feed_sync:${venue.feed_type}`,
        discovered.length,
        imported.imported,
        status,
        JSON.stringify({
          mode: 'feed_sync',
          venue,
          discovered,
          imported_count: imported.imported,
          skipped_count: imported.skipped,
        }),
      ]
    )

    await query(
      `UPDATE venues
       SET last_feed_synced_at = NOW(),
           last_feed_sync_status = $2
       WHERE id = $1`,
      [venue.id, status]
    )

    return {
      venue,
      discovered,
      imported: imported.imported,
      skipped: imported.skipped,
      status,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown feed sync error'

    await query(
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response)
       VALUES ($1, NOW(), $2, 0, 0, 'failed', $3)`,
      [
        venue.id,
        `feed_sync:${venue.feed_type}`,
        JSON.stringify({ mode: 'feed_sync', venue, error: message }),
      ]
    )
    await query(
      `UPDATE venues
       SET last_feed_synced_at = NOW(),
           last_feed_sync_status = 'failed'
       WHERE id = $1`,
      [venue.id]
    )

    return {
      venue,
      discovered: [],
      imported: 0,
      skipped: 0,
      status: 'failed',
      error: message,
    }
  }
}
