import { query } from '@/lib/db'
import { extractStateFromAddress } from '@/lib/geocode'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

export type DiscoveryEventType = 'game' | 'concert' | 'other'
export type DiscoveryStatus = 'discovered' | 'confirmed' | 'imported'
export type DiscoveryMatchType = 'official_source' | 'ai_inferred'

export interface DiscoveryVenue {
  id: string
  name: string
  address: string | null
  market_name: string | null
  slack_channel_id?: string | null
  requires_assignment: boolean
  active_service_count: number
  likely_leagues: string[]
}

interface ExistingEventRow {
  id: string
  summary: string
  event_date: string
  start_time: string | null
  event_type: string | null
  league: string | null
  source: string | null
}

export interface DiscoveryCandidate {
  venue_id: string
  venue_name: string
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: DiscoveryEventType
  league: string | null
  home_team: string | null
  away_team: string | null
  source_url: string | null
  source_domain: string | null
  source_label: string | null
  source_kind: string
  source: string
  match_type: DiscoveryMatchType
  matched_query: string | null
  evidence_snippet: string | null
  confidence: number
  trust_score: number
  trust_reasons: string[]
  duplicate: boolean
  duplicate_reason: string | null
  requires_staffing: boolean
  status: DiscoveryStatus
  auto_importable: boolean
}

interface RawDiscoveryCandidate {
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: string | null
  league: string | null
  home_team: string | null
  away_team: string | null
  source_url: string | null
  source_label: string | null
  source_kind: string | null
  matched_query: string | null
  evidence_snippet: string | null
  confidence: number | null
}

export interface DiscoveryBatchResult {
  venues: Array<{ id: string; name: string }>
  discovered: DiscoveryCandidate[]
  total_found: number
  duplicates_skipped: number
  existing_count: number
  discovery_hint?: string | null
  include_existing?: boolean
}

function normalizeSummary(summary: string): string {
  return (summary || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeWords(summary: string): string[] {
  return (summary || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function wordSimilarity(a: string, b: string): number {
  const aWords = new Set(normalizeWords(a))
  const bWords = new Set(normalizeWords(b))
  if (aWords.size === 0 || bWords.size === 0) return 0
  let overlap = 0
  for (const word of aWords) {
    if (bWords.has(word)) overlap++
  }
  return overlap / Math.max(aWords.size, bWords.size)
}

function normalizeTimeForKey(time: string | null): string | null {
  if (!time) return null
  const match = time.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : null
}

function sourceKindFromUrl(url: string | null, venueName: string): string {
  if (!url) return 'ai_discovery'
  const lower = url.toLowerCase()
  if (lower.includes('ticketmaster')) return 'ticketmaster'
  if (lower.includes('nba.com') || lower.includes('nhl.com') || lower.includes('mlb.com') || lower.includes('wnba.com') || lower.includes('ncaa.com') || lower.includes('espn.com')) return 'league_schedule'
  const venueSlug = venueName.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (lower.includes(venueSlug)) return 'venue_calendar'
  return 'team_website'
}

function sourceDomainFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function buildSourceLabel(url: string | null, fallbackKind: string): string {
  if (!url) return fallbackKind
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return hostname
  } catch {
    return fallbackKind
  }
}

function clampConfidence(value: number | null | undefined, sourceKind: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }
  if (['ticketmaster', 'league_schedule', 'team_website', 'venue_calendar'].includes(sourceKind)) return 0.82
  return 0.62
}

function isOfficialSourceKind(sourceKind: string): boolean {
  return ['ticketmaster', 'league_schedule', 'venue_calendar', 'team_website'].includes(sourceKind)
}

function getMatchType(sourceKind: string, sourceUrl: string | null): DiscoveryMatchType {
  return isOfficialSourceKind(sourceKind) && Boolean(sourceUrl) ? 'official_source' : 'ai_inferred'
}

function scoreDiscoveryTrust(params: {
  confidence: number
  sourceKind: string
  sourceDomain: string | null
  matchType: DiscoveryMatchType
  evidenceSnippet: string | null
  matchedQuery: string | null
}): { trustScore: number; trustReasons: string[] } {
  const reasons: string[] = []
  let score = params.confidence * 0.45

  if (params.matchType === 'official_source') {
    score += 0.25
    reasons.push('Official source URL captured at discovery time')
  } else {
    reasons.push('No official source URL captured, so this remains AI-inferred')
  }

  if (params.sourceKind === 'ticketmaster') {
    score += 0.18
    reasons.push('Matched Ticketmaster listing')
  } else if (params.sourceKind === 'league_schedule') {
    score += 0.16
    reasons.push('Matched league schedule domain')
  } else if (params.sourceKind === 'venue_calendar') {
    score += 0.14
    reasons.push('Matched venue calendar source')
  } else if (params.sourceKind === 'team_website') {
    score += 0.12
    reasons.push('Matched team website source')
  }

  if (params.sourceDomain) {
    reasons.push(`Source domain: ${params.sourceDomain}`)
  }
  if (params.evidenceSnippet) {
    score += 0.08
    reasons.push('Supporting text snippet captured from search evidence')
  }
  if (params.matchedQuery) {
    score += 0.04
    reasons.push(`Matched via query: ${params.matchedQuery}`)
  }

  return {
    trustScore: Math.max(0, Math.min(1, score)),
    trustReasons: reasons,
  }
}

function parseCityFromAddress(address: string | null): string | null {
  if (!address) return null
  const parts = address.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return null
}

function buildSearchQueries(venue: DiscoveryVenue): string[] {
  const city = parseCityFromAddress(venue.address)
  const state = extractStateFromAddress(venue.address || '') || venue.market_name || ''
  const location = [city, state].filter(Boolean).join(', ')
  const leagueHint = venue.likely_leagues.length > 0 ? ` ${venue.likely_leagues.join(' ')}` : ''
  return [
    `${venue.name} ticketmaster${leagueHint} upcoming events`,
    `${venue.name} official venue calendar ${location}`.trim(),
    `${venue.name} team schedule ${location}${leagueHint}`.trim(),
    `${venue.name} league schedule ${location}${leagueHint}`.trim(),
  ]
}

function buildSearchQueriesWithHint(venue: DiscoveryVenue, discoveryHint?: string | null): string[] {
  const baseQueries = buildSearchQueries(venue)
  const hint = discoveryHint?.trim()
  if (!hint) return baseQueries
  return [...baseQueries, `${venue.name} ${hint}`.trim()]
}

interface SearchEvidence {
  query: string
  result_url: string | null
  source_domain: string | null
  snippet: string
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function decodeDuckDuckGoHref(href: string): string | null {
  if (!href) return null
  try {
    const normalized = href.startsWith('//') ? `https:${href}` : href
    const url = new URL(normalized, 'https://html.duckduckgo.com')
    const uddg = url.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : normalized
  } catch {
    return href
  }
}

async function searchWeb(queryStr: string): Promise<SearchEvidence[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryStr)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    const links = [...cleanHtml.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const snippets = [...cleanHtml.matchAll(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)]

    return links.slice(0, 6).map((match, index) => {
      const resultUrl = decodeDuckDuckGoHref(match[1])
      return {
        query: queryStr,
        result_url: resultUrl,
        source_domain: sourceDomainFromUrl(resultUrl),
        snippet: stripHtml(snippets[index]?.[1] || match[2] || '').slice(0, 280),
      }
    }).filter((entry) => entry.snippet || entry.result_url)
  } catch {
    return []
  }
}

async function loadExistingEvents(venueId: string, startDate: string, endDate: string): Promise<ExistingEventRow[]> {
  const result = await query(
    `SELECT id,
            summary,
            TO_CHAR(event_date, 'YYYY-MM-DD') as event_date,
            TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH24:MI') as start_time,
            event_type,
            league,
            source
     FROM events
     WHERE venue_id = $1
       AND event_date >= $2
       AND event_date <= $3`,
    [venueId, startDate, endDate]
  )
  return result.rows
}

function findDuplicate(candidate: DiscoveryCandidate, existingEvents: ExistingEventRow[]): { duplicate: boolean; reason: string | null } {
  const normalizedSummary = normalizeSummary(candidate.summary)
  const normalizedTime = normalizeTimeForKey(candidate.start_time)

  for (const existing of existingEvents) {
    if (existing.event_date !== candidate.event_date) continue

    if (normalizedTime && existing.start_time && normalizeTimeForKey(existing.start_time) === normalizedTime) {
      return { duplicate: true, reason: 'Same date and start time already exists' }
    }

    if (normalizeSummary(existing.summary) === normalizedSummary) {
      return { duplicate: true, reason: 'Same date and summary already exists' }
    }

    if (wordSimilarity(existing.summary, candidate.summary) >= 0.8) {
      return { duplicate: true, reason: 'Similar event already exists on this date' }
    }
  }

  return { duplicate: false, reason: null }
}

function buildExistingDemoCandidates(
  venue: DiscoveryVenue,
  existingEvents: ExistingEventRow[]
): DiscoveryCandidate[] {
  return existingEvents.map((event) => {
    const eventType: DiscoveryEventType =
      event.event_type === 'game' || event.event_type === 'concert' ? event.event_type : 'other'

    return {
      venue_id: venue.id,
      venue_name: venue.name,
      summary: event.summary,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: null,
      event_type: eventType,
      league: event.league || null,
      home_team: null,
      away_team: null,
      source_url: null,
      source_domain: null,
      source_label: 'Existing ANC event',
      source_kind: 'existing_event',
      source: event.source || 'existing_event',
      match_type: 'ai_inferred',
      matched_query: null,
      evidence_snippet: 'Loaded from the ANC events database because demo mode is enabled.',
      confidence: 1,
      trust_score: 1,
      trust_reasons: ['Loaded directly from the ANC event database for demo mode review'],
      duplicate: true,
      duplicate_reason: 'Already exists in database (demo mode)',
      requires_staffing: venue.active_service_count > 0,
      status: 'discovered',
      auto_importable: false,
    }
  })
}

async function discoverWithAI(
  venue: DiscoveryVenue,
  existingEvents: ExistingEventRow[],
  discoveryHint?: string | null,
  includeExisting?: boolean
): Promise<RawDiscoveryCandidate[]> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const searchQueries = buildSearchQueriesWithHint(venue, discoveryHint)
  const searchResults = (await Promise.all(searchQueries.map(searchWeb))).flat()

  const city = parseCityFromAddress(venue.address)
  const state = extractStateFromAddress(venue.address || '') || venue.market_name || ''
  const location = [city, state].filter(Boolean).join(', ')
  const existingList = existingEvents.length > 0
    ? existingEvents.map(event => `${event.event_date}${event.start_time ? ` ${event.start_time}` : ''} — ${event.summary}`).join('\n')
    : 'None'

  const prompt = `You are ANC's event aggregation engine. Discover upcoming events for one venue and return structured JSON only.

VENUE
- Name: ${venue.name}
- Address: ${venue.address || 'Unknown'}
- City/State: ${location || 'Unknown'}
- Active services: ${venue.active_service_count}
- Likely leagues: ${venue.likely_leagues.join(', ') || 'Unknown'}
- Pilot emphasis: Prudential Center and Fenway Park should be handled carefully if matched.
${discoveryHint?.trim() ? `- Discovery hint from user: ${discoveryHint.trim()}` : ''}
${includeExisting ? '- Demo mode: include events even if they already exist in the database so they can be reviewed as duplicates.' : ''}

DISCOVERY WINDOW
- Start: ${today}
- End: ${sixtyDaysOut}

EXISTING EVENTS IN DATABASE
${existingList}

SEARCH RESULTS
${searchResults.length > 0
    ? searchResults.map((result, index) => [
      `RESULT ${index + 1}`,
      `Query: ${result.query}`,
      `URL: ${result.result_url || 'Unknown'}`,
      `Domain: ${result.source_domain || 'Unknown'}`,
      `Snippet: ${result.snippet || 'None'}`,
    ].join('\n')).join('\n\n---\n\n')
    : 'No search results captured'}

INSTRUCTIONS
- Search for games, concerts, and other ticketed venue events.
- Follow the discovery hint when it narrows the search, but do not invent events without evidence.
- Favor official sources: team websites, Ticketmaster, league schedule pages, and the venue calendar.
- Return both home_team and away_team when the event is a game and the matchup is known.
- Use event_type values: "game", "concert", or "other".
- Use source_kind values: "ticketmaster", "team_website", "league_schedule", "venue_calendar", or "ai_discovery".
- Return matched_query using the exact query string from the search results above when possible.
- Return evidence_snippet using a short verbatim snippet from the search results above when possible.
- Use confidence as a decimal from 0.00 to 1.00.
- If a source URL is unknown, set source_url to null.
- If a source label is unknown, set source_label to a short human-readable source name.
${includeExisting
    ? '- You may include events that already exist in the database list above if they appear in search results. The application will flag them as duplicates later.'
    : '- Do not include anything already in the database list above.'}

RETURN ONLY JSON
[{
  "summary": "Boston Red Sox vs New York Yankees",
  "event_date": "2026-04-10",
  "start_time": "19:10",
  "end_time": null,
  "event_type": "game",
  "league": "MLB",
  "home_team": "Boston Red Sox",
  "away_team": "New York Yankees",
  "source_url": "https://...",
  "source_label": "ticketmaster.com",
  "source_kind": "ticketmaster",
  "matched_query": "Fenway Park ticketmaster MLB upcoming events",
  "evidence_snippet": "Boston Red Sox vs New York Yankees at Fenway Park on Apr 10",
  "confidence": 0.94
}]`

  const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 8000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are an expert event aggregation and normalization system. Respond with valid JSON only.' },
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
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as RawDiscoveryCandidate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hydrateCandidate(raw: RawDiscoveryCandidate, venue: DiscoveryVenue): DiscoveryCandidate | null {
  if (!raw.summary || !raw.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.event_date)) return null
  const sourceKind = raw.source_kind || sourceKindFromUrl(raw.source_url || null, venue.name)
  const sourceUrl = raw.source_url || null
  const sourceDomain = sourceDomainFromUrl(sourceUrl)
  const matchType = getMatchType(sourceKind, sourceUrl)
  const confidence = clampConfidence(raw.confidence, sourceKind)
  const evidenceSnippet = raw.evidence_snippet?.trim() ? raw.evidence_snippet.trim().slice(0, 280) : null
  const matchedQuery = raw.matched_query?.trim() ? raw.matched_query.trim().slice(0, 140) : null
  const { trustScore, trustReasons } = scoreDiscoveryTrust({
    confidence,
    sourceKind,
    sourceDomain,
    matchType,
    evidenceSnippet,
    matchedQuery,
  })
  const eventType: DiscoveryEventType = raw.event_type === 'game' || raw.event_type === 'concert' ? raw.event_type : 'other'
  const startTime = raw.start_time && /^\d{2}:\d{2}$/.test(raw.start_time) ? raw.start_time : null
  const endTime = raw.end_time && /^\d{2}:\d{2}$/.test(raw.end_time) ? raw.end_time : null

  return {
    venue_id: venue.id,
    venue_name: venue.name,
    summary: raw.summary.trim(),
    event_date: raw.event_date,
    start_time: startTime,
    end_time: endTime,
    event_type: eventType,
    league: raw.league || null,
    home_team: raw.home_team || null,
    away_team: raw.away_team || null,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    source_label: raw.source_label || buildSourceLabel(sourceUrl, sourceKind),
    source_kind: sourceKind,
    source: sourceKind,
    match_type: matchType,
    matched_query: matchedQuery,
    evidence_snippet: evidenceSnippet,
    confidence,
    trust_score: trustScore,
    trust_reasons: trustReasons,
    duplicate: false,
    duplicate_reason: null,
    requires_staffing: venue.active_service_count > 0,
    status: 'discovered',
    auto_importable: matchType === 'official_source' && trustScore >= 0.78 && confidence >= 0.85 && isOfficialSourceKind(sourceKind),
  }
}

export async function discoverForVenue(
  venue: DiscoveryVenue,
  discoveryHint?: string | null,
  includeExisting = false
): Promise<DiscoveryBatchResult> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const existingEvents = await loadExistingEvents(venue.id, today, sixtyDaysOut)
  const raw = await discoverWithAI(venue, existingEvents, discoveryHint, includeExisting)

  const candidates = raw
    .map(candidate => hydrateCandidate(candidate, venue))
    .filter((candidate): candidate is DiscoveryCandidate => Boolean(candidate))

  if (includeExisting && existingEvents.length > 0) {
    candidates.push(...buildExistingDemoCandidates(venue, existingEvents))
  }

  const deduped: DiscoveryCandidate[] = []
  const seenKeys = new Set<string>()

  for (const candidate of candidates) {
    const localKey = `${candidate.event_date}|${normalizeTimeForKey(candidate.start_time) || 'na'}|${normalizeSummary(candidate.summary)}`
    if (seenKeys.has(localKey)) continue
    seenKeys.add(localKey)

    const dup = findDuplicate(candidate, existingEvents)
    deduped.push({
      ...candidate,
      duplicate: dup.duplicate,
      duplicate_reason: dup.reason,
    })
  }

  return {
    venues: [{ id: venue.id, name: venue.name }],
    discovered: deduped,
    total_found: deduped.length,
    duplicates_skipped: deduped.filter(event => event.duplicate).length,
    existing_count: existingEvents.length,
    discovery_hint: discoveryHint?.trim() || null,
    include_existing: includeExisting,
  }
}

export async function discoverAcrossVenues(
  venues: DiscoveryVenue[],
  discoveryHint?: string | null,
  includeExisting = false
): Promise<DiscoveryBatchResult> {
  const results: DiscoveryCandidate[] = []
  let totalExisting = 0

  for (const venue of venues) {
    const venueResult = await discoverForVenue(venue, discoveryHint, includeExisting)
    results.push(...venueResult.discovered)
    totalExisting += venueResult.existing_count
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return {
    venues: venues.map(venue => ({ id: venue.id, name: venue.name })),
    discovered: results,
    total_found: results.length,
    duplicates_skipped: results.filter(event => event.duplicate).length,
    existing_count: totalExisting,
    discovery_hint: discoveryHint?.trim() || null,
    include_existing: includeExisting,
  }
}

export async function getDiscoveryVenue(venueId: string): Promise<DiscoveryVenue | null> {
  const result = await query(
    `SELECT
       v.id,
       v.name,
       v.address,
       m.name as market_name,
       v.slack_channel_id,
       COALESCE(v.requires_assignment, true) as requires_assignment,
       COUNT(CASE WHEN vs.enabled = true THEN 1 END)::int as active_service_count,
       COALESCE(array_remove(array_agg(DISTINCT e.league), NULL), '{}') as likely_leagues
     FROM venues v
     LEFT JOIN markets m ON v.market_id = m.id
     LEFT JOIN venue_services vs ON vs.venue_id = v.id
     LEFT JOIN events e ON e.venue_id = v.id AND e.league IS NOT NULL
     WHERE v.id = $1
     GROUP BY v.id, m.name`,
    [venueId]
  )
  return result.rows[0] || null
}

export async function getActiveDiscoveryVenues(): Promise<DiscoveryVenue[]> {
  const result = await query(
    `SELECT
       v.id,
       v.name,
       v.address,
       m.name as market_name,
       v.slack_channel_id,
       COALESCE(v.requires_assignment, true) as requires_assignment,
       COUNT(CASE WHEN vs.enabled = true THEN 1 END)::int as active_service_count,
       COALESCE(array_remove(array_agg(DISTINCT e.league), NULL), '{}') as likely_leagues
     FROM venues v
     LEFT JOIN markets m ON v.market_id = m.id
     LEFT JOIN venue_services vs ON vs.venue_id = v.id
     LEFT JOIN events e ON e.venue_id = v.id AND e.league IS NOT NULL
     WHERE COALESCE(v.is_active, true) = true
     GROUP BY v.id, m.name
     HAVING COUNT(CASE WHEN vs.enabled = true THEN 1 END) > 0
     ORDER BY
       CASE
         WHEN LOWER(v.name) = 'prudential center' THEN 0
         WHEN LOWER(v.name) = 'fenway park' THEN 1
         ELSE 2
       END,
       v.name`
  )
  return result.rows
}

export async function importDiscoveryEvents(
  payload: {
    defaultVenueId?: string
    events: DiscoveryCandidate[]
    status: Exclude<DiscoveryStatus, 'discovered'>
  }
): Promise<{ imported: number; skipped: number; eventIds: string[]; byVenue: Record<string, number> }> {
  const eventIds: string[] = []
  const byVenue: Record<string, number> = {}
  let imported = 0
  let skipped = 0

  for (const event of payload.events) {
    const venueId = event.venue_id || payload.defaultVenueId
    if (!venueId || !event.summary || !event.event_date) {
      skipped++
      continue
    }

    const existing = await loadExistingEvents(venueId, event.event_date, event.event_date)
    const hydrated = { ...event, venue_id: venueId }
    const dup = findDuplicate(hydrated, existing)
    if (dup.duplicate) {
      skipped++
      continue
    }

    const startTimestamp = event.start_time
      ? `${event.event_date}T${event.start_time}:00`
      : `${event.event_date}T00:00:00`
    let endTimestamp = `${event.event_date}T03:00:00`
    if (event.end_time) {
      endTimestamp = `${event.event_date}T${event.end_time}:00`
    } else if (event.start_time) {
      const [hours, minutes] = event.start_time.split(':').map(Number)
      endTimestamp = `${event.event_date}T${String((hours + 3) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    }

    const result = await query(
      `INSERT INTO events (
         summary, event_date, start_time, end_time, venue_id, league,
         workflow_status, event_type, source, requires_staffing
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
       RETURNING id`,
      [
        event.summary,
        event.event_date,
        startTimestamp,
        endTimestamp,
        venueId,
        event.league || null,
        event.event_type,
        event.source || 'ai_discovery',
        Boolean(event.requires_staffing),
      ]
    )

    eventIds.push(result.rows[0].id)
    imported++
    byVenue[venueId] = (byVenue[venueId] || 0) + 1
  }

  return { imported, skipped, eventIds, byVenue }
}
