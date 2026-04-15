import { dedupeFeedEvents, fetchFeedText, inferLeague, normalizeClock, toIsoDate } from '@/lib/feed-parsers/shared'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

const SERPER_API_KEY = process.env.SERPER_API_KEY || ''
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

/**
 * When TM direct scraping is blocked, use Serper (Google) to search for
 * the venue's events — Google indexes TM listings plus StubHub, SeatGeek,
 * team sites, etc. Feed the combined snippets to the LLM for extraction.
 */
async function ticketmasterFallbackViaSearch(params: ParseFeedParams): Promise<FeedEvent[]> {
  if (!SERPER_API_KEY || !AI_API_KEY) return []
  const queries = [
    `${params.venueName} ticketmaster upcoming events`,
    `${params.venueName} schedule 2026`,
    `${params.venueName} concerts this month`,
  ]
  const searches = await Promise.all(queries.map(async (q) => {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_API_KEY },
        body: JSON.stringify({ q, num: 8 }),
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) return []
      const data = await res.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> }
      return (data.organic || []).slice(0, 6)
    } catch { return [] }
  }))
  const snippets = searches.flat()
  if (snippets.length === 0) return []

  const prompt = `Extract upcoming events at ${params.venueName} from these search snippets. Return JSON array only.
Each event needs: name, date (YYYY-MM-DD), time (HH:MM 24h local, null if unknown), teams (array), eventType ("game"|"concert"|"other"), league (or null), confidence (0-1).

SNIPPETS:
${snippets.map((s, i) => `${i+1}. ${s.title || ''} — ${s.snippet || ''} [${s.link || ''}]`).join('\n')}

JSON:`

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'Event extractor. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    })
    if (!res.ok) return []
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content || ''
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = clean.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as Array<{ name?: string; date?: string; time?: string | null; teams?: string[]; eventType?: string; league?: string | null; confidence?: number }>
    return parsed.filter(e =>
      e?.name && e?.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date!)
      // Require a real HH:MM — snippets without a time produce misleading
      // 12:00 AM entries on the calendar. Drop them rather than import
      // half-truths.
      && typeof e.time === 'string' && /^\d{2}:\d{2}$/.test(e.time)
    ).map(e => ({
      name: e.name!,
      date: e.date!,
      time: e.time || null,
      teams: Array.isArray(e.teams) ? e.teams : [],
      eventType: (e.eventType === 'game' || e.eventType === 'concert' ? e.eventType : 'other') as 'game' | 'concert' | 'other',
      league: e.league || inferLeague(e.name!),
      source: 'ticketmaster',
      confidence: typeof e.confidence === 'number' ? e.confidence : 0.75,
      sourceUrl: params.feedUrl,
      sourceLabel: 'Ticketmaster (via search)',
    }))
  } catch {
    return []
  }
}

function absoluteUrl(baseUrl: string, href: string | null): string | null {
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

export async function parseTicketmasterFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  let text = ''
  try {
    const fetched = await fetchFeedText(params.feedUrl)
    text = fetched.text
  } catch {
    // Both direct + Ollama fetch failed (TM blocks both). Fall through to
    // search-based extraction.
    text = ''
  }

  // If the fetch went through the Ollama web_fetch fallback we get plain
  // text instead of Ticketmaster's HTML markup. Detect that (no TM DOM
  // classes present) and hand off to the generic AI-backed parser, which
  // extracts events from rendered text.
  if (!text.includes('class="element-item')) {
    // TM blocks both direct scraping and Ollama fetching. Use Serper
    // Google search + LLM extraction as the reliable fallback.
    const viaSearch = await ticketmasterFallbackViaSearch(params)
    if (viaSearch.length > 0) return dedupeFeedEvents(viaSearch)
    // Last resort: generic parser against whatever text we did get.
    if (text) {
      const { parseGenericFeed } = await import('@/lib/feed-parsers/generic')
      const generic = await parseGenericFeed(params)
      return generic.map((event) => ({ ...event, source: 'ticketmaster', sourceLabel: event.sourceLabel || 'Ticketmaster' }))
    }
    return []
  }

  const events: FeedEvent[] = []
  const blocks = text.split('<div class="element-item').slice(1).map((block) => `<div class="element-item${block}`)

  for (const block of blocks) {
    const detailHref = block.match(/<a href="([^"]+)"/i)?.[1] || null
    const month = block.match(/<div class="eventmonth">([^<]+)<\/div>/i)?.[1] || null
    const day = block.match(/<div class="eventday">([^<]+)<\/div>/i)?.[1] || null
    const time = block.match(/<div class="eventtime">([^<]+)<\/div>/i)?.[1] || null
    const heading = block.match(/<h3>([^<]+)<\/h3>/i)?.[1] || null
    const ticketmasterUrl = block.match(/<a href="(https:\/\/www\.ticketmaster\.com\/event[^"]+)"/i)?.[1] || null
    if (!month || !day || !heading) continue

    const isoDate = toIsoDate(month, day)
    if (!isoDate) continue

    const name = heading.replace(/\s+/g, ' ').trim()
    const teams = name.includes(' vs. ') ? name.split(/\s+vs\.\s+/i) : []

    events.push({
      name,
      date: isoDate,
      time: normalizeClock(time),
      teams,
      eventType: teams.length === 2 ? 'game' : /concert|tour|live/i.test(name) ? 'concert' : 'other',
      league: inferLeague(name),
      source: 'ticketmaster',
      confidence: 0.94,
      sourceUrl: ticketmasterUrl || absoluteUrl(params.feedUrl, detailHref),
      sourceLabel: 'Ticketmaster',
      evidenceSnippet: `${name} on ${month} ${day}`,
    })
  }

  return dedupeFeedEvents(events)
}
