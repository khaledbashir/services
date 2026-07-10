import { query } from '@/lib/db'
import { importDiscoveryEvents, type DiscoveryCandidate } from '@/lib/event-discovery'
import { checkEventSanity } from '@/lib/event-sanity'
import { parseVenueFeed, type FeedEvent, type FeedType } from '@/lib/feed-parsers'
import { buildAutomationSelect, withComputedAutomation } from '@/lib/venue-automation'

export interface FeedVenue {
  id: string
  name: string
  address: string | null
  feed_url: string
  feed_type: FeedType
  timezone?: string | null
  slack_channel_id?: string | null
  client_count?: number
  active_service_count: number
  active_service_names: string[]
  active_service_descriptions: string[]
  requires_staffing_default: boolean
}

interface ExistingEventRow {
  id: string
  summary: string
  event_date: string
  start_time: string | null
  source: string | null
  status: string | null
  workflow_status: string | null
  assigned_count: number
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

async function loadExistingEvents(venueId: string, startDate: string, endDate: string, timezone: string): Promise<ExistingEventRow[]> {
  const result = await query(
    `SELECT id,
            summary,
            TO_CHAR(event_date, 'YYYY-MM-DD') as event_date,
            TO_CHAR(start_time AT TIME ZONE $4, 'HH24:MI') as start_time,
            source,
            status,
            workflow_status,
            (SELECT COUNT(*)::int FROM event_assignments ea WHERE ea.event_id = events.id) AS assigned_count
     FROM events
     WHERE venue_id = $1
       AND event_date >= $2
       AND event_date <= $3`,
    [venueId, startDate, endDate, timezone]
  )
  return result.rows
}

const DISCOVERY_MANAGED_SOURCES = new Set([
  'ticketmaster',
  'venue_calendar',
  'team_website',
  'ai_discovery',
])

function summariesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeSummary(left)
  const normalizedRight = normalizeSummary(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = normalizedLeft.length > normalizedRight.length ? normalizedLeft : normalizedRight
  if (shorter.length >= 8 && longer.includes(shorter)) return true
  return wordSimilarity(left, right) >= 0.6
}

async function reconcileAuthoritativeSchedule(
  venue: FeedVenue,
  feedEvents: FeedEvent[],
  existingEvents: ExistingEventRow[]
): Promise<{ updated: number; cancelled: number }> {
  // Carbonhouse JSON is the venue's own complete calendar for the requested
  // months. Generic/AI-extracted pages are not complete enough to safely
  // cancel rows that disappear from a later run.
  if (venue.feed_type !== 'team-website' || !feedEvents.some((event) => event.source === 'venue_calendar')) {
    return { updated: 0, cancelled: 0 }
  }

  const timezone = venue.timezone || 'America/New_York'
  const matchedExistingIds = new Set<string>()
  let updated = 0

  for (const feedEvent of feedEvents) {
    const match = existingEvents.find((existing) =>
      !matchedExistingIds.has(existing.id)
      && existing.status !== 'cancelled'
      && existing.event_date === feedEvent.date
      && summariesMatch(existing.summary, feedEvent.name)
    )
    if (!match) continue
    matchedExistingIds.add(match.id)

    if (!DISCOVERY_MANAGED_SOURCES.has(match.source || '')) continue
    const nextTime = normalizeTimeForKey(feedEvent.time)
    const currentTime = normalizeTimeForKey(match.start_time)
    if (match.summary === feedEvent.name && nextTime === currentTime && match.status !== 'cancelled') continue

    await query(
      `UPDATE events
       SET summary = $2,
           event_type = $3,
           league = $4,
           start_time = CASE
             WHEN $5::text IS NULL THEN (($6::date + TIME '00:00') AT TIME ZONE $7)
             ELSE (($6::date + $5::time) AT TIME ZONE $7)
           END,
           end_time = CASE
             WHEN $5::text IS NULL THEN (($6::date + TIME '03:00') AT TIME ZONE $7)
             ELSE ((($6::date + $5::time) AT TIME ZONE $7) + INTERVAL '3 hours')
           END,
           status = 'scheduled',
           source = $8,
           updated_at = NOW()
       WHERE id = $1`,
      [match.id, feedEvent.name, feedEvent.eventType, feedEvent.league, nextTime, feedEvent.date, timezone, feedEvent.source]
    )
    updated++
  }

  let cancelled = 0
  for (const existing of existingEvents) {
    if (matchedExistingIds.has(existing.id)) continue
    if (!DISCOVERY_MANAGED_SOURCES.has(existing.source || '')) continue
    if (existing.status === 'cancelled') continue
    if (existing.workflow_status !== 'pending' || Number(existing.assigned_count || 0) > 0) continue

    await query(
      `UPDATE events SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [existing.id]
    )
    cancelled++
  }

  return { updated, cancelled }
}

// Only filter genuinely TBD placeholder schedule entries, not real matchups
// that Ticketmaster has tagged "(If Necessary)" — those are stripped at the
// parser boundary (see stripPlayoffSuffix) and the underlying game is real.
const PLACEHOLDER_PATTERN = /(vs\.?\s*tbd|tbd\s*vs|tbd\s*at\s+|date:?\s*tbd|playoff game\s*$|playoffs:.*tbd|home game (one|two|three|four|five|six|seven|[1-7])\b|round (one|two|three|four|[1-4]).*(home game|game [1-7]))/i

function isPlaceholderSummary(summary: string | null | undefined): boolean {
  if (!summary) return false
  return PLACEHOLDER_PATTERN.test(summary)
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
    start_iso: feedEvent.startIso ?? null,
    end_iso: null,
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
    requires_staffing: null,
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
       v.timezone,
       v.slack_channel_id,
       ${buildAutomationSelect('v', 'vs', 'st')}
     FROM venues v
     LEFT JOIN client_venues cv ON cv.venue_id = v.id
     LEFT JOIN client_services vs ON vs.client_id = cv.client_id
     LEFT JOIN service_types st ON st.id = vs.service_type_id
     WHERE COALESCE(v.feed_url, '') <> ''
       AND COALESCE(v.is_active, true) = true
     GROUP BY v.id
     ORDER BY v.name`
  )
  return result.rows.map(withComputedAutomation)
}

export async function syncVenueFeed(
  venue: FeedVenue,
  audit?: { triggeredByUserId?: string | null; trigger?: 'manual' | 'cron' | 'auto_save' | 'api' }
): Promise<{
  venue: FeedVenue
  discovered: DiscoveryCandidate[]
  imported: number
  skipped: number
  status: 'success' | 'partial' | 'failed'
  error?: string
}> {
  const today = new Date().toISOString().split('T')[0]
  const horizonDays = venue.feed_type === 'team-website' ? 365 : 90
  const horizonEnd = new Date(Date.now() + horizonDays * 86400000).toISOString().split('T')[0]
  const triggeredBy = audit?.triggeredByUserId || null
  const trigger = audit?.trigger || 'cron'

  try {
    const parsedEvents = await parseVenueFeed(venue.feed_type, {
      venueName: venue.name,
      feedUrl: venue.feed_url,
      venueAddress: venue.address,
    })

    const windowedEvents = parsedEvents.filter((event) => {
      if (event.date < today || event.date > horizonEnd) return false
      if (isPlaceholderSummary(event.name)) return false
      const sanity = checkEventSanity({
        summary: event.name,
        league: event.league,
        event_date: event.date,
        event_type: event.eventType,
      })
      return sanity.valid
    })
    const timezone = venue.timezone || 'America/New_York'
    const existingBeforeReconcile = await loadExistingEvents(venue.id, today, horizonEnd, timezone)
    const reconciliation = await reconcileAuthoritativeSchedule(venue, windowedEvents, existingBeforeReconcile)
    const existingEvents = (await loadExistingEvents(venue.id, today, horizonEnd, timezone))
      .filter((event) => event.status !== 'cancelled')
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
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response, triggered_by_user_id, trigger)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
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
          reconciliation,
        }),
        triggeredBy,
        trigger,
      ]
    )

    await query(
      `UPDATE venues
       SET last_feed_synced_at = NOW(),
           last_feed_sync_status = $2
       WHERE id = $1`,
      [venue.id, status]
    )

    // Joe 2026-05-04: auto-feed Slack pings retired — events list / dashboard
    // are the canonical surface. Keep the discovery_log row above for audit.

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
      `INSERT INTO discovery_log (venue_id, discovered_at, source, events_found, events_imported, status, raw_response, triggered_by_user_id, trigger)
       VALUES ($1, NOW(), $2, 0, 0, 'failed', $3, $4, $5)`,
      [
        venue.id,
        `feed_sync:${venue.feed_type}`,
        JSON.stringify({ mode: 'feed_sync', venue, error: message }),
        triggeredBy,
        trigger,
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
