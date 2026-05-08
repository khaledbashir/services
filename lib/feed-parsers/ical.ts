import { dedupeFeedEvents, inferLeague } from '@/lib/feed-parsers/shared'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// `webcal://` and `webcals://` are calendar-subscription aliases that fetch()
// can't open. They map 1:1 to https:// — convert before requesting.
function normalizeIcsUrl(url: string): string {
  return url.replace(/^webcal:\/\//i, 'https://').replace(/^webcals:\/\//i, 'https://')
}

// RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + a single
// space or tab. Without unfolding, long SUMMARY/LOCATION/DESCRIPTION values get
// chopped and field regexes miss them.
function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

function readField(block: string, field: string): string | null {
  // Anchor to start-of-line (multiline) so DESCRIPTION text containing
  // "SUMMARY" or similar substrings can't poison the match.
  const re = new RegExp(`^${field}(?:;[^:\\r\\n]*)?:(.+)$`, 'im')
  const match = block.match(re)
  return match ? match[1].trim() : null
}

function parseIcsDate(value: string | null): { date: string; time: string | null } | null {
  if (!value) return null
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!match) return null
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: match[4] ? `${match[4]}:${match[5]}` : null,
  }
}

// MLB / NBA / NHL / NFL feeds frequently prefix the SUMMARY with a sport emoji
// and a leading space (e.g. "⚾️ Miami Marlins @ Washington Nationals"). Strip
// any leading emoji + whitespace so dedup keys, league inference, and team
// extraction all see a clean name.
function cleanSummary(raw: string): string {
  return raw
    // Drop ICS escapes for commas / semicolons / newlines.
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, ' ')
    // Strip leading emoji / pictographs / variation selectors before the first
    // word character. \p{Extended_Pictographic} covers ⚾🏈🏀⚽🏒🎤 etc.
    .replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Sports calendars use a few different separators for matchups. Recognize all
// of them so we classify games correctly and pull both team names. Order
// matters: longer/more specific patterns first.
const MATCHUP_SEPARATORS = [/\s+vs\.\s+/i, /\s+vs\s+/i, /\s+@\s+/, /\s+at\s+/i]

function extractTeams(summary: string): { teams: string[]; isGame: boolean } {
  for (const sep of MATCHUP_SEPARATORS) {
    if (sep.test(summary)) {
      const parts = summary.split(sep).map((p) => p.trim()).filter(Boolean)
      if (parts.length === 2) return { teams: parts, isGame: true }
    }
  }
  return { teams: [], isGame: false }
}

export async function parseIcalFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  const url = normalizeIcsUrl(params.feedUrl.trim())

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`iCal fetch failed for ${url}: ${message}`)
  }

  if (!res.ok) throw new Error(`iCal request failed: ${res.status} ${res.statusText}`)
  const rawText = await res.text()
  const text = unfoldIcs(rawText)

  const events: FeedEvent[] = []
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const summaryRaw = readField(block, 'SUMMARY')
    const start = parseIcsDate(readField(block, 'DTSTART'))
    if (!summaryRaw || !start) continue

    const name = cleanSummary(summaryRaw)
    if (!name) continue
    const { teams, isGame } = extractTeams(name)
    const lower = name.toLowerCase()
    const eventType: FeedEvent['eventType'] = isGame
      ? 'game'
      : /concert|tour|live|festival/.test(lower)
        ? 'concert'
        : 'other'

    events.push({
      name,
      date: start.date,
      time: start.time,
      teams,
      eventType,
      league: inferLeague(name),
      source: 'ical',
      confidence: 0.97,
      sourceUrl: params.feedUrl,
      sourceLabel: 'iCal Feed',
      evidenceSnippet: name,
    })
  }

  return dedupeFeedEvents(events)
}
