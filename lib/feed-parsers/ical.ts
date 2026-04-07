import { dedupeFeedEvents } from '@/lib/feed-parsers/shared'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

function readField(block: string, field: string): string | null {
  const match = block.match(new RegExp(`${field}(?:;[^:]*)?:(.+)`, 'i'))
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

export async function parseIcalFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  const res = await fetch(params.feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Feed request failed: ${res.status}`)
  const text = await res.text()

  const events: FeedEvent[] = []
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const summary = readField(block, 'SUMMARY')
    const start = parseIcsDate(readField(block, 'DTSTART'))
    if (!summary || !start) continue
    events.push({
      name: summary,
      date: start.date,
      time: start.time,
      teams: summary.includes(' vs ') ? summary.split(/\s+vs\.?\s+/i) : [],
      eventType: summary.includes(' vs ') ? 'game' : 'other',
      league: null,
      source: 'ical',
      confidence: 0.97,
      sourceUrl: params.feedUrl,
      sourceLabel: 'iCal Feed',
      evidenceSnippet: summary,
    })
  }

  return dedupeFeedEvents(events)
}
