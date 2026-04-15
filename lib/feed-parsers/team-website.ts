import { dedupeFeedEvents } from '@/lib/feed-parsers/shared'
import { parseGenericFeed } from '@/lib/feed-parsers/generic'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

export async function parseTeamWebsiteFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  if (params.feedUrl.includes('statsapi.mlb.com')) {
    const res = await fetch(params.feedUrl, {
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
        if (!home || !away || !venueName || venueName.toLowerCase() !== params.venueName.toLowerCase()) continue
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
