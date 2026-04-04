import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

interface DiscoveredEvent {
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: 'game' | 'concert' | 'other'
  league: string | null
  teams: string | null
  source: string | null
}

async function searchWeb(queryStr: string): Promise<string> {
  try {
    // Use DuckDuckGo HTML lite — no API key needed
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryStr)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    // Extract text snippets from result blocks
    const snippets = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return snippets.slice(0, 8000)
  } catch {
    return ''
  }
}

async function discoverWithAI(
  venueName: string,
  venueAddress: string,
  searchResults: string[],
  existingEvents: string[]
): Promise<DiscoveredEvent[]> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const existingList = existingEvents.length > 0
    ? `\n\nEVENTS ALREADY IN DATABASE (skip these):\n${existingEvents.join('\n')}`
    : ''

  const searchContext = searchResults.filter(Boolean).length > 0
    ? `\n\nWEB SEARCH RESULTS:\n${searchResults.join('\n\n---\n\n')}`
    : ''

  const prompt = `You are an event discovery system for venue management. Find all upcoming events at the specified venue.

VENUE: ${venueName}
ADDRESS: ${venueAddress}
DATE RANGE: ${today} to ${sixtyDaysOut}
${searchContext}
${existingList}

INSTRUCTIONS:
- List ALL upcoming events at this venue within the date range (games, concerts, shows, etc.)
- For sports: include the league (NBA, NHL, NFL, MLB, MLS, NCAAM, NCAAF, etc.) and both team names in the summary
- For concerts/shows: set league to null, event_type to "concert"
- Use your knowledge of current sports schedules, concert tours, and venue calendars
- Use the web search results above to find additional events and verify dates/times
- Do NOT include events that match any in the "already in database" list
- Dates must be in YYYY-MM-DD format
- Times in HH:MM 24-hour format (or null if unknown)
- Be thorough — include regular season games, playoffs, concerts, special events

Return ONLY a JSON array of objects with these exact fields:
[{
  "summary": "Team A vs Team B" or "Artist Name Live",
  "event_date": "YYYY-MM-DD",
  "start_time": "HH:MM" or null,
  "end_time": null,
  "event_type": "game" | "concert" | "other",
  "league": "NBA" | "NHL" | "NFL" | "MLB" | "MLS" | etc. | null,
  "teams": "Team A vs Team B" or null,
  "source": "URL or site name where this event was found" or null
}]

Return ONLY the JSON array, no other text.`

  const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 8000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are an expert at finding and structuring event schedules for sports venues and entertainment arenas. Always return valid JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    throw new Error(`AI API error: ${aiRes.status} — ${err}`)
  }

  const aiData = await aiRes.json()
  const content = aiData.choices?.[0]?.message?.content || '[]'

  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const events: DiscoveredEvent[] = JSON.parse(jsonMatch[0])
    // Validate and clean
    return events.filter(e =>
      e.summary && e.event_date && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date)
    ).map(e => ({
      summary: e.summary.trim(),
      event_date: e.event_date,
      start_time: e.start_time && /^\d{2}:\d{2}$/.test(e.start_time) ? e.start_time : null,
      end_time: e.end_time && /^\d{2}:\d{2}$/.test(e.end_time) ? e.end_time : null,
      event_type: ['game', 'concert', 'other'].includes(e.event_type) ? e.event_type : 'other',
      league: e.league || null,
      teams: e.teams || null,
      source: e.source || null,
    }))
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { venue_id } = await request.json()
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    // 1. Look up venue
    const venueRes = await query(
      'SELECT id, name, address FROM venues WHERE id = $1',
      [venue_id]
    )
    if (venueRes.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }
    const venue = venueRes.rows[0]

    // 2. Get existing events for dedup
    const today = new Date().toISOString().split('T')[0]
    const sixtyDays = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
    const existingRes = await query(
      `SELECT summary, TO_CHAR(event_date, 'YYYY-MM-DD') as event_date
       FROM events WHERE venue_id = $1 AND event_date >= $2 AND event_date <= $3`,
      [venue_id, today, sixtyDays]
    )
    const existingEvents = existingRes.rows.map(
      (r: { summary: string; event_date: string }) => `${r.event_date}: ${r.summary}`
    )

    // 3. Web search for event schedules
    const queries = [
      `${venue.name} upcoming events schedule 2026`,
      `${venue.name} ${venue.address} events calendar April May 2026`,
    ]
    const searchResults = await Promise.all(queries.map(searchWeb))

    // 4. AI-powered extraction
    const discovered = await discoverWithAI(
      venue.name,
      venue.address || '',
      searchResults,
      existingEvents
    )

    // 5. Server-side dedup against existing events (fuzzy match on date + similar name)
    const existingSet = new Set(
      existingRes.rows.map((r: { summary: string; event_date: string }) =>
        `${r.event_date}|${r.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      )
    )

    const deduplicated = discovered.filter(e => {
      const key = `${e.event_date}|${e.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      return !existingSet.has(key)
    })

    return NextResponse.json({
      venue: { id: venue.id, name: venue.name },
      discovered: deduplicated,
      total_found: discovered.length,
      duplicates_skipped: discovered.length - deduplicated.length,
      existing_count: existingEvents.length,
    })
  } catch (err) {
    console.error('Event discovery error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery failed' },
      { status: 500 }
    )
  }
}
