import { dedupeFeedEvents } from '@/lib/feed-parsers/shared'
import { parseGenericFeed } from '@/lib/feed-parsers/generic'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

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
