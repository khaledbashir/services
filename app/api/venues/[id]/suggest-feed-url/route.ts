import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const SERPER_API_KEY = process.env.SERPER_API_KEY || ''
const OLLAMA_SEARCH_URL = process.env.OLLAMA_SEARCH_URL || 'https://ollama.com/api/web_search'
const OLLAMA_SEARCH_KEY = process.env.OLLAMA_API_KEY || process.env.AI_API_KEY || ''

interface FeedUrlCandidate {
  url: string
  title: string
  snippet: string
  score: number      // 0..1, our heuristic confidence
  source_kind: 'ticketmaster' | 'league_schedule' | 'venue_calendar' | 'team_website' | 'other'
}

function classifyUrl(url: string, venueName: string): FeedUrlCandidate['source_kind'] {
  const lower = url.toLowerCase()
  if (lower.includes('ticketmaster.com')) return 'ticketmaster'
  if (
    lower.includes('nba.com') || lower.includes('nhl.com') || lower.includes('mlb.com') ||
    lower.includes('wnba.com') || lower.includes('ncaa.com') || lower.includes('nfl.com') ||
    lower.includes('mls') || lower.includes('espn.com')
  ) return 'league_schedule'
  const slug = venueName.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (lower.includes(slug)) return 'venue_calendar'
  if (lower.includes('schedule') || lower.includes('events') || lower.includes('calendar') || lower.includes('roster')) return 'team_website'
  return 'other'
}

function scoreCandidate(url: string, snippet: string, venueName: string, kind: FeedUrlCandidate['source_kind']): number {
  let score = 0
  // Source kind weighting — Ticketmaster + league schedules are gold
  if (kind === 'ticketmaster') score += 0.45
  else if (kind === 'league_schedule') score += 0.40
  else if (kind === 'venue_calendar') score += 0.30
  else if (kind === 'team_website') score += 0.20
  else score += 0.10

  const lowerUrl = url.toLowerCase()
  const lowerSnippet = (snippet || '').toLowerCase()
  const venueLower = venueName.toLowerCase()

  // Schedule/calendar keywords in URL = strong signal
  if (lowerUrl.includes('/schedule')) score += 0.15
  if (lowerUrl.includes('/events')) score += 0.12
  if (lowerUrl.includes('/calendar')) score += 0.10
  if (lowerUrl.includes('upcoming')) score += 0.05

  // Venue name match
  if (lowerUrl.includes(venueLower.replace(/\s+/g, '-')) || lowerUrl.includes(venueLower.replace(/\s+/g, ''))) score += 0.10
  if (lowerSnippet.includes(venueLower)) score += 0.05

  // Penalize obvious non-feed pages
  if (lowerUrl.includes('/news') || lowerUrl.includes('/blog') || lowerUrl.includes('/article')) score -= 0.20
  if (lowerUrl.includes('/about') || lowerUrl.includes('/contact')) score -= 0.20
  if (lowerUrl.endsWith('.pdf')) score -= 0.30

  return Math.max(0, Math.min(1, score))
}

interface RawHit {
  title: string
  url: string
  snippet: string
}

async function searchWeb(queryStr: string): Promise<RawHit[]> {
  if (SERPER_API_KEY) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_API_KEY },
        body: JSON.stringify({ q: queryStr, num: 8 }),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const data = await res.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> }
        return (data.organic || []).slice(0, 8).map((r) => ({
          title: r.title || '',
          url: r.link || '',
          snippet: r.snippet || '',
        })).filter((r) => r.url)
      }
    } catch {
      // fall through
    }
  }

  if (!OLLAMA_SEARCH_KEY) return []
  try {
    const res = await fetch(OLLAMA_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OLLAMA_SEARCH_KEY}` },
      body: JSON.stringify({ query: queryStr }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return []
    const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> }
    return (data.results || []).slice(0, 8).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 400),
    })).filter((r) => r.url)
  } catch {
    return []
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const venueId = params.id
    const venueRes = await query(
      `SELECT v.id, v.name, v.address, v.feed_url, v.venue_type,
              COALESCE(array_remove(array_agg(DISTINCT e.league), NULL), '{}') as likely_leagues
       FROM venues v
       LEFT JOIN events e ON e.venue_id = v.id AND e.league IS NOT NULL
       WHERE v.id = $1
       GROUP BY v.id`,
      [venueId]
    )
    const venue = venueRes.rows[0]
    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    if (venue.venue_type !== 'sports') {
      return NextResponse.json({ error: 'Feed URLs only apply to sports venues' }, { status: 400 })
    }

    const leagueHint = (venue.likely_leagues || []).slice(0, 2).join(' ')
    const queries = [
      `${venue.name} ticketmaster ${leagueHint} schedule`.trim().replace(/\s+/g, ' '),
      `${venue.name} upcoming events schedule`,
      `${venue.name} official events calendar`,
    ]

    const allHits: RawHit[] = []
    for (const q of queries) {
      const hits = await searchWeb(q)
      allHits.push(...hits)
    }

    // Dedupe by URL
    const seen = new Set<string>()
    const unique: RawHit[] = []
    for (const h of allHits) {
      const norm = h.url.replace(/\?.*$/, '').replace(/\/$/, '')
      if (seen.has(norm)) continue
      seen.add(norm)
      unique.push(h)
    }

    const candidates: FeedUrlCandidate[] = unique.map((h) => {
      const kind = classifyUrl(h.url, venue.name)
      return {
        url: h.url,
        title: h.title,
        snippet: h.snippet,
        score: scoreCandidate(h.url, h.snippet, venue.name, kind),
        source_kind: kind,
      }
    })

    // Top 5 by score, but keep at least 3 even if scores are low
    candidates.sort((a, b) => b.score - a.score)
    const top = candidates.slice(0, 5)

    return NextResponse.json({
      venue: { id: venue.id, name: venue.name, address: venue.address, feed_url: venue.feed_url, leagues: venue.likely_leagues },
      candidates: top,
      queries_tried: queries,
    })
  } catch (err) {
    console.error('Error suggesting feed URL:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
