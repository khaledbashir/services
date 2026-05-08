import type { FeedEvent } from '@/lib/feed-parsers/types'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function fetchFeedText(url: string): Promise<{ text: string; contentType: string | null }> {
  const cleanUrl = url.trim().replace(/\s+/g, '')
  // First try a direct fetch with a real browser UA. Ticketmaster and other
  // large venues 403 anything identifying itself as a bot, so we cosplay as
  // Chrome. If we still get 403/blocked, fall through to Ollama web_fetch
  // which renders the page in a real browser.
  try {
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (res.ok) {
      return { text: await res.text(), contentType: res.headers.get('content-type') }
    }
    if (res.status !== 403 && res.status !== 429 && res.status !== 503) {
      throw new Error(`Feed request failed: ${res.status}`)
    }
  } catch (err) {
    // network-level failure — try fallback
    if (!(err instanceof Error) || !/Feed request failed/.test(err.message)) {
      // fall through
    }
  }

  // Fallback: Ollama web_fetch. Uses a real browser so TM's bot filter
  // passes. Returns plain text content which our HTML parsers can still
  // regex over (they don't need raw markup for snippet extraction).
  const ollamaKey = process.env.OLLAMA_API_KEY || process.env.AI_API_KEY || ''
  if (ollamaKey) {
    try {
      const res = await fetch(process.env.OLLAMA_FETCH_URL || 'https://ollama.com/api/web_fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ollamaKey}` },
        body: JSON.stringify({ url: cleanUrl }),
        signal: AbortSignal.timeout(25000),
      })
      if (res.ok) {
        const data = await res.json() as { content?: string; text?: string; error?: string }
        const text = data.content || data.text || ''
        if (text) return { text, contentType: 'text/plain' }
      }
    } catch {
      // fall through to error
    }
  }

  throw new Error(`Feed request failed: direct fetch blocked and Ollama fallback unavailable`)
}

export function toIsoDate(month: string, day: string): string | null {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }

  const monthNumber = months[month.trim().toLowerCase().slice(0, 3)]
  const dayNumber = Number(day)
  if (!monthNumber || !dayNumber) return null

  const now = new Date()
  let year = now.getUTCFullYear()
  const candidate = new Date(Date.UTC(year, monthNumber - 1, dayNumber))
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000)
  if (candidate < sixtyDaysAgo) year += 1

  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
}

export function normalizeClock(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (!match) return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null

  let hours = Number(match[1])
  const minutes = Number(match[2] || '0')
  const meridiem = match[3]
  if (meridiem === 'PM' && hours !== 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function inferLeague(name: string): string | null {
  const lower = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const compact = lower.replace(/\s+/g, '')
  const includesAny = (terms: string[]) =>
    terms.some((term) => lower.includes(term) || compact.includes(term.replace(/\s+/g, '')))

  // Full MLB coverage — one missing club (e.g. the Nationals) means iCal-imported
  // games drop out of league filters and the "events for X" widgets show stale.
  if (includesAny([
    'red sox', 'yankees', 'blue jays', 'orioles', 'rays', 'brewers', 'dodgers', 'giants',
    'mets', 'phillies', 'braves', 'mariners', 'padres', 'cubs', 'cardinals',
    'nationals', 'marlins', 'pirates', 'reds', 'rockies', 'diamondbacks', 'astros',
    'texas rangers', 'angels', 'athletics', 'twins', 'white sox', 'guardians', 'tigers', 'royals',
  ])) return 'MLB'

  if (includesAny([
    'devils', 'flyers', 'rangers', 'bruins', 'islanders', 'penguins', 'capitals',
    'kraken', 'canucks', 'sharks', 'la kings', 'los angeles kings', 'ducks', 'golden knights',
    'canadiens', 'maple leafs',
  ])) return 'NHL'

  if (includesAny([
    'trail blazers', 'trailblazers', 'blazers', 'celtics', 'knicks', 'nets', 'spurs',
    'lakers', 'clippers', 'warriors', 'sacramento kings', 'suns', 'jazz', 'nuggets', 'thunder',
    'mavericks', 'rockets', 'grizzlies', 'pelicans', 'timberwolves', 'bucks', 'bulls',
    'cavaliers', 'pistons', 'pacers', 'heat', 'magic', 'hawks', 'hornets', 'wizards',
    'raptors', '76ers', 'sixers',
  ])) return 'NBA'

  return null
}

// Words that show up in venue names everywhere — they don't disambiguate
// "Nationals Park" from "Yankee Stadium". Strip them before token-matching
// against team names.
const VENUE_GENERIC_WORDS = new Set([
  'park', 'stadium', 'arena', 'center', 'centre', 'field', 'ballpark',
  'grounds', 'complex', 'pavilion', 'coliseum', 'court', 'house',
  'the', 'of', 'at', 'and',
])

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function distinctVenueTokens(venueName: string): Set<string> {
  return new Set(tokenize(venueName).filter((word) => !VENUE_GENERIC_WORDS.has(word)))
}

/**
 * Best-effort home/away classifier for a parsed game summary. Returns:
 *   - 'home'    → the venue's primary team is hosting
 *   - 'away'    → the venue's primary team is on the road (drop the event)
 *   - 'unknown' → can't tell from name overlap; default to keeping the event
 *
 * Heuristic: tokenize the venue name (minus generic words like "Park"), then
 * tokenize each team. The team that shares a distinctive word with the venue
 * IS the venue's team. Combine that with the matchup separator to decide
 * home vs away — `@` and `at` put the away team first; `vs.` and `vs` put
 * the home team first by convention on team-owned schedule pages.
 */
export function classifyHomeAway(
  venueName: string,
  summary: string,
  teams: string[]
): 'home' | 'away' | 'unknown' {
  if (!venueName || !summary || teams.length !== 2) return 'unknown'
  const venueTokens = distinctVenueTokens(venueName)
  if (venueTokens.size === 0) return 'unknown'

  const teamMatches = (team: string) => {
    const tokens = new Set(tokenize(team).filter((w) => !VENUE_GENERIC_WORDS.has(w)))
    let overlap = 0
    for (const t of tokens) if (venueTokens.has(t)) overlap++
    return overlap
  }
  const left = teamMatches(teams[0])
  const right = teamMatches(teams[1])
  if (left === 0 && right === 0) return 'unknown'

  // The team with the stronger venue-name overlap is the venue's team.
  const venueTeamSlot: 'left' | 'right' = right >= left ? 'right' : 'left'

  // Determine which slot is home from the matchup separator. Test ` @ ` /
  // ` at ` first because they're unambiguous (away first). For `vs.` / `vs`
  // we default to "first team is home" — true on team-owned schedule pages
  // and on the MLB Stats API output we already produce.
  let homeSlot: 'left' | 'right'
  if (/\s+@\s+/.test(summary) || /\s+at\s+/i.test(summary)) {
    homeSlot = 'right'
  } else {
    homeSlot = 'left'
  }

  return venueTeamSlot === homeSlot ? 'home' : 'away'
}

// Ticketmaster keeps "(If Necessary)" and "(TBA)" markers on playoff games
// even after the series is decided, e.g. "Raptors at Cavaliers Rd 1 Hm Gm 3
// (If Necessary)" stays tagged after Game 2 makes the game necessary. The
// matchup itself is real and tickets are being sold, so strip the suffix at
// the parser boundary instead of dropping the whole event downstream.
export function stripPlayoffSuffix(name: string): string {
  return name.replace(/\s*\((?:if necessary|tba)\)\s*$/i, '').trim()
}

export function dedupeFeedEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.date}|${event.time || 'na'}|${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
