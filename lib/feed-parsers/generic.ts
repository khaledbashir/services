import { classifyHomeAway, dedupeFeedEvents, fetchFeedText } from '@/lib/feed-parsers/shared'
import type { FeedEvent, ParseFeedParams } from '@/lib/feed-parsers/types'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseGenericFeed(params: ParseFeedParams): Promise<FeedEvent[]> {
  const { text, contentType } = await fetchFeedText(params.feedUrl)
  const sourceText = contentType?.includes('json') ? text : stripHtml(text)
  const prompt = `You extract scheduled venue events into JSON.

Venue: ${params.venueName}
Source URL: ${params.feedUrl}

Return upcoming events only. Respond with JSON only.
- Only include events that are explicitly happening at this venue.
- Exclude team road schedules, away games, opponent schedules, and league-wide schedules unless the source clearly says the game is at this venue.
[{
  "name": "Boston Red Sox vs New York Yankees",
  "date": "2026-04-10",
  "time": "19:10",
  "teams": ["Boston Red Sox", "New York Yankees"],
  "eventType": "game",
  "league": "MLB",
  "source": "other",
  "confidence": 0.86,
  "evidenceSnippet": "Boston Red Sox vs New York Yankees"
}]

SOURCE CONTENT:
${sourceText.slice(0, 24000)}`

  const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 5000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are an event feed normalization system. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!aiRes.ok) throw new Error(`AI API error: ${aiRes.status}`)
  const aiData = await aiRes.json()
  const content = aiData.choices?.[0]?.message?.content || '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  let parsed: FeedEvent[] = []
  try {
    parsed = JSON.parse(jsonMatch[0]) as FeedEvent[]
  } catch {
    parsed = []
  }

  return dedupeFeedEvents(
    parsed
      .filter((event) => event?.name && event?.date)
      // Defensive away-game filter: AI extractors sometimes return team
      // road-trip games as if they happened at this venue, especially for
      // team schedule pages. Drop them when the name + venue overlap
      // unambiguously says the venue's team is on the road.
      .filter((event) => {
        const teams = Array.isArray(event.teams) && event.teams.length === 2
          ? event.teams.map((t) => String(t || '')).filter(Boolean)
          : []
        if (event.eventType !== 'game' || teams.length !== 2) return true
        return classifyHomeAway(params.venueName, event.name, teams) !== 'away'
      })
      .map((event) => ({
        ...event,
        source: event.source || 'other',
        confidence: typeof event.confidence === 'number' ? event.confidence : 0.78,
        sourceUrl: params.feedUrl,
        sourceLabel: 'Generic Feed',
      }))
  )
}
