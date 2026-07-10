import { dedupeFeedEvents, inferLeague, normalizeClock } from '@/lib/feed-parsers/shared'
import { parseGenericFeed } from '@/lib/feed-parsers/generic'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function absoluteUrl(baseUrl: string, href: string | null): string | null {
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

function classifyEvent(name: string): FeedEvent['eventType'] {
  if (/\b(vs\.?|at)\b/i.test(name)) return 'game'
  if (/concert|tour|live|band|music|festival/i.test(name)) return 'concert'
  return 'other'
}

function monthKeys(start: Date, end: Date): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const finalMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  while (cursor <= finalMonth) {
    result.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

/**
 * Carbonhouse venue sites render their calendars client-side, so the public
 * page contains no event rows for the generic/AI parser to read. Their own
 * calendar widget calls a stable JSON endpoint; read that endpoint directly
 * so "Official Website" really means the venue's current schedule.
 */
async function parseCarbonhouseCalendar(params: ParseFeedParams): Promise<FeedEvent[] | null> {
  let feed: URL
  try {
    feed = new URL(params.feedUrl)
  } catch {
    return null
  }
  if (!/\/events\/calendar\/?$/i.test(feed.pathname)) return null

  const today = new Date()
  const end = new Date(Date.now() + 365 * 86400000)
  const events: FeedEvent[] = []
  let recognizedEndpoint = false

  for (const { year, month } of monthKeys(today, end)) {
    const endpoint = new URL(`/events/calendar/${year}/${month}`, feed.origin)
    endpoint.searchParams.set('v', '2')
    endpoint.searchParams.set('detail_partial', 'modules/events/partials/full_page_calendar_event_item')
    const response = await fetch(endpoint.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!response.ok) return null

    const payload = await response.json().catch(() => null) as Record<string, string> | null
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null
    recognizedEndpoint = true

    for (const [rawDate, html] of Object.entries(payload)) {
      const dateMatch = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (!dateMatch || typeof html !== 'string') continue
      const date = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
      const blocks = html.split(/(?=<div class="event_item")/i).filter((block) => /class="event_item"/i.test(block))

      for (const block of blocks) {
        const heading = block.match(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || null
        if (!heading) continue
        const name = decodeHtml(heading)
        if (!name) continue
        const href = block.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] || null
        const rawTime = block.match(/<div class="showings time"[^>]*>\s*([^<]+)</i)?.[1] || null
        const showtimes = (rawTime || '')
          .split(',')
          .map((value) => normalizeClock(value))
          .filter((value): value is string => Boolean(value))
        const normalizedShowtimes: Array<string | null> = showtimes.length > 0 ? showtimes : [null]

        for (const showtime of normalizedShowtimes) {
          events.push({
            name,
            date,
            time: showtime,
            teams: [],
            eventType: classifyEvent(name),
            league: inferLeague(name),
            source: 'venue_calendar',
            confidence: 0.99,
            sourceUrl: absoluteUrl(feed.origin, href) || params.feedUrl,
            sourceLabel: `${params.venueName} Official Calendar`,
            evidenceSnippet: `${name} on ${date}${showtime ? ` at ${showtime}` : ''}`,
          })
        }
      }
    }
  }

  return recognizedEndpoint ? dedupeFeedEvents(events) : null
}

export async function parseTeamWebsiteFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  if (params.feedUrl.includes('statsapi.mlb.com')) {
    const today = new Date().toISOString().split('T')[0]
    const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
    const parsed = new URL(params.feedUrl)
    if (!parsed.searchParams.has('startDate')) parsed.searchParams.set('startDate', today)
    if (!parsed.searchParams.has('endDate')) parsed.searchParams.set('endDate', ninetyDaysOut)
    if (!parsed.searchParams.has('sportId')) parsed.searchParams.set('sportId', '1')
    if (!parsed.searchParams.has('hydrate')) parsed.searchParams.set('hydrate', 'venue,team')
    const res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Feed request failed: ${res.status}`)
    const payload = await res.json()
    const events: FeedEvent[] = []

    for (const dateRow of payload.dates || []) {
      for (const game of dateRow.games || []) {
        const home = game.teams?.home?.team?.name || null
        const away = game.teams?.away?.team?.name || null
        const venueName = game.venue?.name || params.venueName
        if (!home || !away || !venueName || !venueMatches(venueName, params.venueName)) continue
        events.push({
          name: `${away} vs ${home}`,
          date: game.officialDate,
          time: null,
          startIso: typeof game.gameDate === 'string' ? new Date(game.gameDate).toISOString() : null,
          teams: [away, home],
          eventType: 'game',
          league: 'MLB',
          source: 'team_website',
          confidence: 0.98,
          sourceUrl: params.feedUrl,
          sourceLabel: 'MLB Schedule API',
          evidenceSnippet: `${away} at ${home} on ${game.officialDate}`,
        })
      }
    }

    return dedupeFeedEvents(events)
  }

  const carbonhouseEvents = await parseCarbonhouseCalendar(params)
  if (carbonhouseEvents) return carbonhouseEvents

  const genericEvents = await parseGenericFeed(params)
  return genericEvents.map((event) => ({
    ...event,
    source: 'team_website',
    sourceLabel: event.sourceLabel || 'Team Website',
    confidence: Math.max(event.confidence, 0.82),
  }))
}

function venueMatches(foundVenue: string, targetVenue: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

  return normalize(foundVenue).join(' ') === normalize(targetVenue).join(' ')
}
