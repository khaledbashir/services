import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

// Daily automated event discovery — scans all active sports venues for
// upcoming events, imports new ones, and posts a Slack digest.
//
// Scheduler: 0 7 * * * curl -s https://abc-anc-services.izcgmb.easypanel.host/api/cron/discover-events

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'
const SLACK_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || ''

interface DiscoveredEvent {
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: string
  league: string | null
}

async function searchWeb(q: string): Promise<string> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000)
  } catch { return '' }
}

async function discoverForVenue(
  venueName: string,
  venueAddress: string,
  existingEvents: string[]
): Promise<DiscoveredEvent[]> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDays = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const searchResults = await Promise.all([
    searchWeb(`${venueName} upcoming events schedule 2026`),
    searchWeb(`${venueName} ${venueAddress} events April May June 2026`),
  ])

  const existingList = existingEvents.length > 0
    ? `\n\nEVENTS ALREADY IN DATABASE (skip these):\n${existingEvents.join('\n')}`
    : ''

  const searchContext = searchResults.filter(Boolean).length > 0
    ? `\n\nWEB SEARCH RESULTS:\n${searchResults.filter(Boolean).join('\n\n---\n\n')}`
    : ''

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
        { role: 'system', content: 'You are an expert at finding and structuring event schedules for sports venues. Always return valid JSON.' },
        { role: 'user', content: `Find all upcoming events at this venue.

VENUE: ${venueName}
ADDRESS: ${venueAddress}
DATE RANGE: ${today} to ${sixtyDays}
${searchContext}
${existingList}

Return a JSON array of events. Each object: {"summary":"Team A vs Team B","event_date":"YYYY-MM-DD","start_time":"HH:MM" or null,"end_time":null,"event_type":"game"|"concert"|"other","league":"NBA"|"NHL"|etc or null}

Return ONLY the JSON array.` },
      ],
    }),
  })

  if (!aiRes.ok) return []

  const data = await aiRes.json()
  const content = data.choices?.[0]?.message?.content || '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const events: DiscoveredEvent[] = JSON.parse(jsonMatch[0])
    return events.filter(e => e.summary && e.event_date && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date))
  } catch { return [] }
}

// Shared logic: discover + optionally import for a single venue
async function processVenue(
  venue: { id: string; name: string; address: string; slack_channel_id?: string },
  mode: 'import' | 'preview'
) {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDays = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const existingRes = await query(
    `SELECT summary, TO_CHAR(event_date, 'YYYY-MM-DD') as event_date
     FROM events WHERE venue_id = $1 AND event_date >= $2 AND event_date <= $3`,
    [venue.id, today, sixtyDays]
  )
  const existingEvents = existingRes.rows.map(
    (r: { summary: string; event_date: string }) => `${r.event_date}: ${r.summary}`
  )
  const existingSet = new Set(
    existingRes.rows.map((r: { summary: string; event_date: string }) =>
      `${r.event_date}|${r.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    )
  )

  const discovered = await discoverForVenue(venue.name, venue.address || '', existingEvents)

  // Deduplicate
  const newEvents = discovered.filter(e => {
    const key = `${e.event_date}|${e.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    return !existingSet.has(key)
  })

  if (mode === 'preview') {
    return { name: venue.name, venue_id: venue.id, found: discovered.length, new_events: newEvents, imported: 0 }
  }

  // Import mode
  let imported = 0
  for (const e of newEvents) {
    const key = `${e.event_date}|${e.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (existingSet.has(key)) continue

    const startTs = e.start_time ? `${e.event_date}T${e.start_time}:00` : `${e.event_date}T00:00:00`
    let endTs: string
    if (e.end_time) {
      endTs = `${e.event_date}T${e.end_time}:00`
    } else if (e.start_time) {
      const [h, m] = e.start_time.split(':').map(Number)
      endTs = `${e.event_date}T${String((h + 3) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
    } else {
      endTs = `${e.event_date}T03:00:00`
    }

    await query(
      `INSERT INTO events (summary, event_date, start_time, end_time, venue_id, league, workflow_status, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'event')`,
      [e.summary, e.event_date, startTs, endTs, venue.id, e.league || null]
    )
    existingSet.add(key)
    imported++
  }

  return { name: venue.name, venue_id: venue.id, found: discovered.length, new_events: newEvents, imported }
}

// Query params:
//   venue_id=<uuid>  — target a single venue (omit = all active sports venues)
//   venue=<name>     — find venue by name (fuzzy match)
//   preview=true     — return discovered events without importing
//
// Examples:
//   GET /api/cron/discover-events                           → full scan, import all, Slack digest
//   GET /api/cron/discover-events?venue=Prudential+Center   → single venue, import + notify
//   GET /api/cron/discover-events?venue=Fenway&preview=true → preview only, no import
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')
    const venueName = searchParams.get('venue')
    const preview = searchParams.get('preview') === 'true'
    const mode = preview ? 'preview' : 'import'

    // Single venue mode
    if (venueId || venueName) {
      let venueRes
      if (venueId) {
        venueRes = await query('SELECT id, name, address, slack_channel_id FROM venues WHERE id = $1', [venueId])
      } else {
        venueRes = await query(
          'SELECT id, name, address, slack_channel_id FROM venues WHERE LOWER(name) LIKE $1 LIMIT 1',
          [`%${venueName!.toLowerCase()}%`]
        )
      }

      if (venueRes.rows.length === 0) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
      }

      const venue = venueRes.rows[0]
      const result = await processVenue(venue, mode)

      // Post to Slack if we imported anything
      if (!preview && result.imported > 0 && SLACK_CHANNEL) {
        const eventLines = result.new_events
          .slice(0, 15)
          .map((e: DiscoveredEvent) => `  ${e.event_date} — ${e.summary}${e.league ? ` (${e.league})` : ''}`)
          .join('\n')

        await sendSlackMessage(
          venue.slack_channel_id || SLACK_CHANNEL,
          `:mag: *Event Discovery — ${venue.name}*\n\nImported *${result.imported} new events*:\n\n${eventLines}${result.new_events.length > 15 ? `\n  _...and ${result.new_events.length - 15} more_` : ''}\n\n_Events are pending — <https://abc-anc-services.izcgmb.easypanel.host/venues/${venue.id}|assign staff on the dashboard>._`
        )
      }

      return NextResponse.json(result)
    }

    // Full scan mode (all venues)
    const venuesRes = await query(
      `SELECT id, name, address, slack_channel_id FROM venues WHERE is_active = true AND venue_type = 'sports' ORDER BY name`
    )
    const venues = venuesRes.rows

    if (venues.length === 0) {
      return NextResponse.json({ message: 'No active sports venues', imported: 0 })
    }

    let totalImported = 0
    let totalSkipped = 0
    const venueResults: Array<{ name: string; imported: number; found: number }> = []

    for (const venue of venues) {
      try {
        const result = await processVenue(venue, mode)
        const skipped = result.found - (preview ? result.new_events.length : result.imported)
        totalSkipped += skipped
        totalImported += preview ? result.new_events.length : result.imported

        if (result.found > 0) {
          venueResults.push({ name: result.name, imported: preview ? result.new_events.length : result.imported, found: result.found })
        }

        // Rate limit between venues
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`Discovery failed for ${venue.name}:`, err)
      }
    }

    // Post Slack digest (only on import mode)
    if (!preview && SLACK_CHANNEL) {
      if (totalImported > 0) {
        const lines = venueResults
          .filter(v => v.imported > 0)
          .map(v => `  *${v.name}:* ${v.imported} new events`)
          .join('\n')

        await sendSlackMessage(
          SLACK_CHANNEL,
          `:mag: *Daily Event Discovery*\n\nFound *${totalImported} new events* across ${venueResults.filter(v => v.imported > 0).length} venues:\n\n${lines}\n\n${totalSkipped > 0 ? `_${totalSkipped} duplicates skipped._\n` : ''}_Events are set to pending — assign staff on the <https://abc-anc-services.izcgmb.easypanel.host/events|dashboard>._`
        )
      } else if (venues.length > 0) {
        await sendSlackMessage(
          SLACK_CHANNEL,
          `:mag: *Daily Event Discovery* — No new events found across ${venues.length} venues. Calendar is up to date.`
        )
      }
    }

    return NextResponse.json({
      mode,
      venues_scanned: venues.length,
      total_new: totalImported,
      total_skipped: totalSkipped,
      details: venueResults,
    })
  } catch (err) {
    console.error('Auto-discovery cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
