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

  if (includesAny([
    'red sox', 'yankees', 'blue jays', 'orioles', 'rays', 'brewers', 'dodgers', 'giants',
    'mets', 'phillies', 'braves', 'mariners', 'padres', 'cubs', 'cardinals',
  ])) return 'MLB'

  if (includesAny([
    'devils', 'flyers', 'rangers', 'bruins', 'islanders', 'penguins', 'capitals',
    'kraken', 'canucks', 'sharks', 'la kings', 'los angeles kings', 'ducks', 'golden knights',
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

export function dedupeFeedEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.date}|${event.time || 'na'}|${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
