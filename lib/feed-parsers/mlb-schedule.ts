import { dedupeFeedEvents } from '@/lib/feed-parsers/shared'
import type { FeedEvent } from '@/lib/feed-parsers/types'

const MLB_VENUE_TEAM_ABBR: Record<string, string> = {
  'angel stadium': 'laa',
  'busch stadium': 'stl',
  'camden yards': 'bal',
  'chase field': 'ari',
  'citi field': 'nym',
  'citizens bank park': 'phi',
  'coors field': 'col',
  'dodger stadium': 'lad',
  'fenway park': 'bos',
  'globe life field': 'tex',
  'great american ball park': 'cin',
  'guaranteed rate field': 'chw',
  'kauffman stadium': 'kc',
  'loanDepot park': 'mia',
  'minute maid park': 'hou',
  'nationals park': 'wsh',
  'oracle park': 'sf',
  'petco park': 'sd',
  'pnc park': 'pit',
  'progressive field': 'cle',
  'rogers centre': 'tor',
  't-mobile park': 'sea',
  'target field': 'min',
  'truist park': 'atl',
  'wrigley field': 'chc',
  'yankee stadium': 'nyy',
}

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

  // statsapi defaults to "today only" when startDate/endDate are missing.
  // Auto-inject a 90-day window so managers can paste the bare endpoint
  // without knowing the query-param dance.
  let url = params.feedUrl || `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${today}&endDate=${ninetyDaysOut}&hydrate=venue,team`
  if (params.feedUrl && /statsapi\.mlb\.com/i.test(params.feedUrl)) {
    const parsed = new URL(params.feedUrl)
    if (!parsed.searchParams.has('startDate')) parsed.searchParams.set('startDate', today)
    if (!parsed.searchParams.has('endDate')) parsed.searchParams.set('endDate', ninetyDaysOut)
    if (!parsed.searchParams.has('sportId')) parsed.searchParams.set('sportId', '1')
    if (!parsed.searchParams.has('hydrate')) parsed.searchParams.set('hydrate', 'venue,team')
    url = parsed.toString()
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!res.ok) {
    const fallbackEvents = await parseEspnMlbScheduleFeed(params.venueName)
    if (fallbackEvents.length > 0) return fallbackEvents
    throw new Error(`MLB Schedule API failed: ${res.status}`)
  }
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

async function parseEspnMlbScheduleFeed(venueName: string): Promise<FeedEvent[]> {
  const teamAbbr = getEspnTeamAbbrForVenue(venueName)
  if (!teamAbbr) return []

  const season = new Date().getUTCFullYear()
  const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamAbbr}/schedule?season=${season}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)',
    },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!res.ok) return []

  const payload = await res.json() as EspnSchedulePayload
  const events: FeedEvent[] = []

  for (const event of payload.events || []) {
    const competition = event.competitions?.[0]
    const eventVenue = competition?.venue?.fullName || ''
    if (!eventVenue || !venueMatches(eventVenue.toLowerCase().trim(), venueName.toLowerCase().trim())) continue

    const competitors = competition?.competitors || []
    const home = competitors.find((competitor) => competitor.homeAway === 'home')?.team?.displayName || null
    const away = competitors.find((competitor) => competitor.homeAway === 'away')?.team?.displayName || null
    if (!home || !away || !event.date) continue

    const eventDate = new Date(event.date)
    if (Number.isNaN(eventDate.getTime())) continue

    events.push({
      name: `${away} vs ${home}`,
      date: eventDate.toISOString().split('T')[0],
      time: null,
      startIso: eventDate.toISOString(),
      teams: [away, home],
      eventType: 'game',
      league: 'MLB',
      source: 'league_schedule',
      confidence: 0.94,
      sourceUrl: `https://www.espn.com/mlb/team/schedule/_/name/${teamAbbr}`,
      sourceLabel: 'MLB Schedule',
      evidenceSnippet: `${away} at ${home} - ${eventVenue} - ${eventDate.toISOString().split('T')[0]}`,
    })
  }

  return dedupeFeedEvents(events)
}

function getEspnTeamAbbrForVenue(venueName: string): string | null {
  const normalizedVenue = normalizeVenueKey(venueName)
  for (const [venue, teamAbbr] of Object.entries(MLB_VENUE_TEAM_ABBR)) {
    if (normalizeVenueKey(venue) === normalizedVenue) return teamAbbr
  }
  return null
}

function normalizeVenueKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface EspnSchedulePayload {
  events?: EspnScheduleEvent[]
}

interface EspnScheduleEvent {
  date?: string
  competitions?: Array<{
    venue?: { fullName?: string }
    competitors?: Array<{
      homeAway?: 'home' | 'away' | string
      team?: { displayName?: string }
    }>
  }>
}

/**
 * Fuzzy venue matching: handles cases like
 * "Fenway Park" matching "fenway park"
 * "JetBlue Park at Fenway South" matching "jetblue park"
 */
function venueMatches(gameVenue: string, ancVenue: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

  const genericWords = new Set([
    'at',
    'the',
    'park',
    'field',
    'stadium',
    'arena',
    'center',
    'centre',
    'ballpark',
    'grounds',
    'complex',
    'pavilion',
    'coliseum',
  ])

  const gWords = normalize(gameVenue)
  const aWords = normalize(ancVenue)
  const gDistinct = gWords.filter((word) => !genericWords.has(word))
  const aDistinct = aWords.filter((word) => !genericWords.has(word))

  if (gameVenue === ancVenue) return true
  if (gDistinct.length > 0 && aDistinct.length > 0 && gDistinct.join(' ') === aDistinct.join(' ')) return true

  const gSet = new Set(gDistinct)
  const aSet = new Set(aDistinct)
  let overlap = 0
  for (const word of gSet) {
    if (aSet.has(word)) overlap++
  }

  if (overlap === 0) return false

  const overlapRatio = overlap / Math.max(gSet.size || 1, aSet.size || 1)
  const smallerSize = Math.min(gSet.size || 0, aSet.size || 0)

  return smallerSize >= 2 && overlap === smallerSize && overlapRatio >= 0.8
}
