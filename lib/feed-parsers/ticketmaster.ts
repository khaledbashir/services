import { dedupeFeedEvents, fetchFeedText, inferLeague, normalizeClock, toIsoDate } from '@/lib/feed-parsers/shared'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

function absoluteUrl(baseUrl: string, href: string | null): string | null {
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

export async function parseTicketmasterFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  const { text } = await fetchFeedText(params.feedUrl)

  // If the fetch went through the Ollama web_fetch fallback we get plain
  // text instead of Ticketmaster's HTML markup. Detect that (no TM DOM
  // classes present) and hand off to the generic AI-backed parser, which
  // extracts events from rendered text.
  if (!text.includes('class="element-item')) {
    const { parseGenericFeed } = await import('@/lib/feed-parsers/generic')
    const generic = await parseGenericFeed(params)
    return generic.map((event) => ({ ...event, source: 'ticketmaster', sourceLabel: event.sourceLabel || 'Ticketmaster' }))
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
