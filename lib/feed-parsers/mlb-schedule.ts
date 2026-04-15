import { dedupeFeedEvents } from '@/lib/feed-parsers/shared'
import type { FeedEvent } from '@/lib/feed-parsers/types'

/**
 * Pulls the full MLB schedule from the Stats API and returns events
 * matching a specific venue name. Used as a master schedule source
 * so every ANC-managed MLB venue gets accurate game data.
 *
 * Feed URL format: https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function parseMlbScheduleFeed(params: {
  venueName: string
  feedUrl?: string
}): Promise<FeedEvent[]> {
  const today = new Date().toISOString().split('T')[0]
  const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  const url = params.feedUrl || `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${today}&endDate=${ninetyDaysOut}&hydrate=venue,team`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`MLB Schedule API failed: ${res.status}`)
  const payload = await res.json()

  const venueNorm = params.venueName.toLowerCase().trim()
  const events: FeedEvent[] = []

  for (const dateRow of payload.dates || []) {
    for (const game of dateRow.games || []) {
      const gameVenue = (game.venue?.name || '').toLowerCase().trim()
      if (!gameVenue || !venueMatches(gameVenue, venueNorm)) continue

      const home = game.teams?.home?.team?.name || null
      const away = game.teams?.away?.team?.name || null
      if (!home || !away) continue

      events.push({
        name: `${away} vs ${home}`,
        date: game.officialDate,
        time: null,
        startIso: typeof game.gameDate === 'string'
          ? new Date(game.gameDate).toISOString()
          : null,
        teams: [away, home],
        eventType: 'game',
        league: 'MLB',
        source: 'league_schedule',
        confidence: 0.98,
        sourceUrl: `https://www.mlb.com/schedule/${game.officialDate}`,
        sourceLabel: 'MLB Schedule',
        evidenceSnippet: `${away} at ${home} — ${game.venue?.name || params.venueName} — ${game.officialDate}`,
      })
    }
  }

  return dedupeFeedEvents(events)
}

/**
 * Fuzzy venue matching: handles cases like
 * "Fenway Park" matching "fenway park"
 * "JetBlue Park at Fenway South" matching "jetblue park"
 */
function venueMatches(gameVenue: string, ancVenue: string): boolean {
  if (gameVenue === ancVenue) return true
  if (gameVenue.includes(ancVenue) || ancVenue.includes(gameVenue)) return true
  // Word overlap: at least 2 shared words and >60% overlap
  const gWords = new Set(gameVenue.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  const aWords = new Set(ancVenue.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  let overlap = 0
  for (const w of gWords) { if (aWords.has(w)) overlap++ }
  return overlap >= 2 && overlap / Math.max(gWords.size, aWords.size) > 0.6
}
