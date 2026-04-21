import { query } from '@/lib/db'
import { extractStateFromAddress } from '@/lib/geocode'
import { parseVenueFeed, type FeedType } from '@/lib/feed-parsers'
import { buildAutomationSelect, getVenueAutomationInfo, withComputedAutomation } from '@/lib/venue-automation'
import { combineLocalToUtc } from '@/lib/timezone'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

interface AiProvider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Round-robin pool of OpenAI-compatible providers. Set AI_PROVIDERS_JSON as
 * a JSON array like:
 *   [{"name":"kimi","baseUrl":"https://ollama.com/v1","apiKey":"k","model":"kimi-k2.5:cloud"},
 *    {"name":"glm","baseUrl":"https://api.z.ai/api/coding/paas/v4","apiKey":"k","model":"glm-4.7"}]
 * Falls back to the single AI_* vars if not set.
 */
function loadProviders(): AiProvider[] {
  const raw = process.env.AI_PROVIDERS_JSON || ''
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as AiProvider[]
      const valid = parsed.filter(p => p && p.baseUrl && p.apiKey && p.model)
      if (valid.length > 0) return valid
    } catch {
      // fall through
    }
  }
  return [{ name: 'default', baseUrl: AI_BASE_URL, apiKey: AI_API_KEY, model: AI_MODEL }]
}

const AI_PROVIDERS: AiProvider[] = loadProviders()
let providerCursor = 0
function nextProvider(): AiProvider {
  const p = AI_PROVIDERS[providerCursor % AI_PROVIDERS.length]
  providerCursor++
  return p
}

/** Suggested parallel-venue concurrency given the configured providers. */
export function getDiscoveryConcurrency(): number {
  return Math.max(3, AI_PROVIDERS.length * 3)
}

export type DiscoveryEventType = 'game' | 'concert' | 'other'
export type DiscoveryStatus = 'discovered' | 'confirmed' | 'imported'
export type DiscoveryMatchType = 'official_source' | 'ai_inferred'

export interface DiscoveryVenue {
  id: string
  name: string
  address: string | null
  market_name: string | null
  venue_type?: string | null
  feed_url?: string | null
  feed_type?: FeedType | null
  slack_channel_id?: string | null
  requires_assignment: boolean
  active_service_count: number
  active_service_names: string[]
  active_service_descriptions: string[]
  requires_staffing_default: boolean
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

interface FeedBackedDiscoveryVenue extends DiscoveryVenue {
  feed_url: string
  feed_type: FeedType
}

export interface DiscoveryCandidate {
  venue_id: string
  venue_name: string
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  // Full UTC ISO for the start (and optional end). When present, the importer
  // trusts these verbatim and skips local-HH:MM → UTC conversion. Set by
  // parsers that already hold an absolute instant (MLB statsapi, etc.).
  start_iso?: string | null
  end_iso?: string | null
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
  if (lower.includes('stubhub')) return 'ticketmaster' // treat StubHub as equivalent ticket source
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
    `${venue.name} stubhub${leagueHint} upcoming events`,
    `site:mlb.com/schedule ${venue.name}${leagueHint}`.trim(),
    `${venue.name} official venue calendar ${location}`.trim(),
    `${venue.name} team schedule ${location}${leagueHint}`.trim(),
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

// Search grounding for AI discovery.
// Prefers Serper (Google Search API) — rich organic snippets with actual
// event details. Falls back to Ollama web_search if Serper isn't configured.
// For each venue run we also pull the top 1–2 result pages via Ollama
// web_fetch so the LLM sees real calendar content, not just snippets.
const SERPER_API_KEY = process.env.SERPER_API_KEY || ''
const OLLAMA_SEARCH_URL = process.env.OLLAMA_SEARCH_URL || 'https://ollama.com/api/web_search'
const OLLAMA_FETCH_URL = process.env.OLLAMA_FETCH_URL || 'https://ollama.com/api/web_fetch'
const OLLAMA_SEARCH_KEY = process.env.OLLAMA_API_KEY || process.env.AI_API_KEY || ''

async function searchWeb(queryStr: string): Promise<SearchEvidence[]> {
  // Preferred: Serper / Google.
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
        return (data.organic || []).slice(0, 6).map((result) => ({
          query: queryStr,
          result_url: result.link || null,
          source_domain: sourceDomainFromUrl(result.link || null),
          snippet: [(result.title || ''), (result.snippet || '')].filter(Boolean).join(' — ').slice(0, 400),
        })).filter((entry) => entry.snippet || entry.result_url)
      }
    } catch {
      // fall through to Ollama
    }
  }

  // Fallback: Ollama web_search.
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
    return (data.results || []).slice(0, 6).map((result) => ({
      query: queryStr,
      result_url: result.url || null,
      source_domain: sourceDomainFromUrl(result.url || null),
      snippet: [(result.title || ''), stripHtml(result.content || '')].filter(Boolean).join(' — ').slice(0, 400),
    })).filter((entry) => entry.snippet || entry.result_url)
  } catch {
    return []
  }
}

/** Pull the rendered text of a page via Ollama web_fetch. Empty on failure. */
async function fetchPageText(url: string): Promise<string> {
  if (!OLLAMA_SEARCH_KEY || !url) return ''
  try {
    const res = await fetch(OLLAMA_FETCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OLLAMA_SEARCH_KEY}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { content?: string; text?: string; error?: string }
    if (data.error) return ''
    return (data.content || data.text || '').slice(0, 4000)
  } catch {
    return ''
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
      requires_staffing: venue.requires_staffing_default,
      status: 'discovered',
      auto_importable: false,
    }
  })
}

function feedEventToDiscoveryCandidate(feedEvent: Awaited<ReturnType<typeof parseVenueFeed>>[number], venue: DiscoveryVenue): DiscoveryCandidate {
  const matchType = feedEvent.source === 'other' ? 'ai_inferred' : 'official_source'
  const trustScore = matchType === 'official_source'
    ? Math.max(feedEvent.confidence, 0.9)
    : Math.max(Math.min(feedEvent.confidence, 0.82), 0.68)

  return {
    venue_id: venue.id,
    venue_name: venue.name,
    summary: feedEvent.name,
    event_date: feedEvent.date,
    start_time: feedEvent.time,
    end_time: null,
    start_iso: feedEvent.startIso ?? null,
    end_iso: null,
    event_type: feedEvent.eventType,
    league: feedEvent.league,
    home_team: feedEvent.teams[1] || null,
    away_team: feedEvent.teams[0] || null,
    source_url: feedEvent.sourceUrl || venue.feed_url || null,
    source_domain: (() => {
      try {
        return new URL(feedEvent.sourceUrl || venue.feed_url || '').hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        return null
      }
    })(),
    source_label: feedEvent.sourceLabel || feedEvent.source,
    source_kind: feedEvent.source,
    source: feedEvent.source,
    match_type: matchType,
    matched_query: venue.feed_type ? `feed:${venue.feed_type}` : 'feed',
    evidence_snippet: feedEvent.evidenceSnippet || `${feedEvent.name} from ${venue.feed_url || venue.name}`,
    confidence: feedEvent.confidence,
    trust_score: trustScore,
    trust_reasons: [
      venue.feed_type ? `Pulled from configured ${venue.feed_type} feed` : 'Pulled from configured venue feed',
      `Feed URL: ${feedEvent.sourceUrl || venue.feed_url || 'unknown'}`,
    ],
    duplicate: false,
    duplicate_reason: null,
    requires_staffing: venue.requires_staffing_default,
    status: 'discovered',
    auto_importable: matchType === 'official_source' && trustScore >= 0.78 && feedEvent.confidence >= 0.85,
  }
}

async function discoverFromConfiguredFeed(
  venue: DiscoveryVenue,
  existingEvents: ExistingEventRow[]
): Promise<DiscoveryCandidate[]> {
  if (!venue.feed_url || !venue.feed_type) return []

  try {
    const today = new Date().toISOString().split('T')[0]
    const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
    const parsedEvents = await parseVenueFeed(venue.feed_type, {
      venueName: venue.name,
      feedUrl: venue.feed_url,
      venueAddress: venue.address,
    })

    return parsedEvents
      .filter((event) => event.date >= today && event.date <= ninetyDaysOut)
      .map((event) => {
        const candidate = feedEventToDiscoveryCandidate(event, venue)
        const duplicate = findDuplicate(candidate, existingEvents)
        return {
          ...candidate,
          duplicate: duplicate.duplicate,
          duplicate_reason: duplicate.reason,
        }
      })
  } catch (error) {
    console.warn(`Configured feed discovery failed for ${venue.name}:`, error)
    return []
  }
}

export type DiscoveryProgress = (step: 'searching' | 'fetching' | 'thinking' | 'parsing', detail?: Record<string, unknown>) => void

async function discoverWithAI(
  venue: DiscoveryVenue,
  existingEvents: ExistingEventRow[],
  discoveryHint?: string | null,
  includeExisting?: boolean,
  onProgress?: DiscoveryProgress
): Promise<RawDiscoveryCandidate[]> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
  const searchQueries = buildSearchQueriesWithHint(venue, discoveryHint)
  onProgress?.('searching', { queries: searchQueries.length })
  const searchResults = (await Promise.all(searchQueries.map(searchWeb))).flat()

  // Pull full page text for the top distinct URLs so the LLM gets real
  // calendar content, not just snippet headers.
  const seenDomains = new Set<string>()
  const fetchTargets: string[] = []
  for (const r of searchResults) {
    if (!r.result_url || !r.source_domain) continue
    if (seenDomains.has(r.source_domain)) continue
    seenDomains.add(r.source_domain)
    fetchTargets.push(r.result_url)
    if (fetchTargets.length >= 3) break
  }
  onProgress?.('fetching', { urls: fetchTargets.length, search_results: searchResults.length })
  const fetchedPages = await Promise.all(fetchTargets.map(async (url) => ({ url, text: await fetchPageText(url) })))
  const pagesBlock = fetchedPages
    .filter((p) => p.text)
    .map((p, i) => `PAGE ${i + 1} (${p.url})\n${p.text}`)
    .join('\n\n---\n\n')

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

FETCHED PAGE CONTENT
${pagesBlock || 'No pages fetched'}

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
- Be EXHAUSTIVE. Return every distinct upcoming event you can extract from the FETCHED PAGE CONTENT above, plus any additional events you can identify from SEARCH RESULTS. Aim for 15-40 events per venue when the source material supports it — do not stop at 3 or 4.
- Do not invent events without evidence, but if a page lists a schedule of games or concerts, extract all of them.
- Favor official sources: team websites, Ticketmaster, league schedule pages, and the venue calendar.
- Only include events that are physically happening at the venue being reviewed.
- Exclude away games, road schedules, opponent schedules, and league-wide schedule entries unless the evidence clearly places the event at this venue.
- Return both home_team and away_team when the event is a game and the matchup is known.
- Use event_type values: "game", "concert", or "other".
- Use source_kind values: "ticketmaster", "team_website", "league_schedule", "venue_calendar", or "ai_discovery".
- Return matched_query using the exact query string from the search results above when possible.
- Return evidence_snippet using a short verbatim snippet (under 140 chars) from the source when possible.
- Use confidence as a decimal from 0.00 to 1.00 (never a string like "high" or "low").
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

  // Try providers in round-robin order; on rate-limit / transient failure,
  // cascade to the next one in the pool. 429 (explicit rate limit) and
  // provider-specific codes like MiniMax 1302 both surface as non-ok
  // responses, so we check the body for rate-limit markers too.
  const isRateLimitLike = (status: number, body: string) =>
    status === 429 || status === 503 || status === 502 ||
    /rate[_\s-]?limit|too many|quota|1302/i.test(body)

  let aiData: { choices?: Array<{ message?: { content?: string } }> } | null = null
  let lastError = ''
  let chosenProvider = AI_PROVIDERS[0]

  for (let attempt = 0; attempt < AI_PROVIDERS.length; attempt++) {
    const provider = nextProvider()
    chosenProvider = provider
    onProgress?.('thinking', { model: provider.model, provider: provider.name, prompt_chars: prompt.length, pages: fetchedPages.filter(p => p.text).length, attempt })
    try {
      const aiRes = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 8000,
          temperature: 0.1,
          messages: [
            { role: 'system', content: 'You are an expert event aggregation and normalization system. Respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (aiRes.ok) {
        aiData = await aiRes.json()
        // Some providers return 200 with an embedded rate-limit error body.
        const embeddedErr = (aiData as { error?: { code?: string | number; message?: string } } | null)?.error
        if (embeddedErr && isRateLimitLike(0, String(embeddedErr.code ?? '') + ' ' + (embeddedErr.message || ''))) {
          lastError = `${provider.name}: ${embeddedErr.message || embeddedErr.code}`
          aiData = null
          continue
        }
        break
      }

      const errBody = await aiRes.text()
      lastError = `${provider.name}: ${aiRes.status} — ${errBody.slice(0, 200)}`
      if (isRateLimitLike(aiRes.status, errBody)) {
        // Try next provider
        continue
      }
      // Non-rate-limit error — still try next provider as a courtesy, but
      // only once more; otherwise the caller never recovers from a bad key.
      if (attempt >= 1) throw new Error(`AI API error: ${lastError}`)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt >= AI_PROVIDERS.length - 1) throw new Error(`AI API error: ${lastError}`)
    }
  }

  if (!aiData) {
    throw new Error(`AI API error: all ${AI_PROVIDERS.length} providers failed. Last: ${lastError}`)
  }

  const rawContent: string = aiData.choices?.[0]?.message?.content || '[]'
  onProgress?.('thinking', { model: chosenProvider.model, provider: chosenProvider.name, prompt_chars: prompt.length, resolved: true })
  // Strip any reasoning scaffolding the provider slipped into `content`:
  //   - <think>…</think> blocks (MiniMax)
  //   - ```json … ``` code fences (GLM, most providers)
  const content = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1')
    .trim()

  // Prefer the last JSON array in the response — thinking text may quote
  // example arrays before the real payload.
  const matches = [...content.matchAll(/\[[\s\S]*?\](?=\s*$|\s*\n\s*$)/g)]
  const candidate = (matches.length > 0 ? matches[matches.length - 1][0] : content.match(/\[[\s\S]*\]/)?.[0]) || '[]'

  try {
    const parsed = JSON.parse(candidate) as RawDiscoveryCandidate[]
    const events = Array.isArray(parsed) ? parsed : []
    onProgress?.('parsing', { events: events.length })
    return events
  } catch {
    onProgress?.('parsing', { events: 0, error: 'parse_failed' })
    return []
  }
}

const PLACEHOLDER_PATTERN = /(if necessary|vs\.?\s*tbd|tbd\s*vs|tbd\s*at\s+|date:?\s*tbd|playoff game\s*$|playoffs:.*tbd|home game (one|two|three|four|five|six|seven|[1-7])\b|round (one|two|three|four|[1-4]).*(home game|game [1-7]))/i

function hydrateCandidate(raw: RawDiscoveryCandidate, venue: DiscoveryVenue): DiscoveryCandidate | null {
  if (!raw.summary || !raw.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.event_date)) return null
  if (PLACEHOLDER_PATTERN.test(raw.summary)) return null
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
    requires_staffing: venue.requires_staffing_default,
    status: 'discovered',
    auto_importable: matchType === 'official_source' && trustScore >= 0.78 && confidence >= 0.85 && isOfficialSourceKind(sourceKind),
  }
}

export async function discoverForVenue(
  venue: DiscoveryVenue,
  discoveryHint?: string | null,
  includeExisting = false,
  onProgress?: DiscoveryProgress
): Promise<DiscoveryBatchResult> {
  const today = new Date().toISOString().split('T')[0]
  const sixtyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
  const existingEvents = await loadExistingEvents(venue.id, today, sixtyDaysOut)
  const feedCandidates = await discoverFromConfiguredFeed(venue, existingEvents)
  const raw = await discoverWithAI(venue, existingEvents, discoveryHint, includeExisting, onProgress)

  const candidates = [
    ...feedCandidates,
    ...raw
    .map(candidate => hydrateCandidate(candidate, venue))
    .filter((candidate): candidate is DiscoveryCandidate => Boolean(candidate)),
  ]

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

function buildCrossVenueKey(candidate: DiscoveryCandidate): string {
  // Key by date + normalized teams (or summary if no teams)
  const date = candidate.event_date
  if (candidate.home_team && candidate.away_team) {
    const teams = [candidate.home_team, candidate.away_team].map(t => t.toLowerCase().trim()).sort().join('|')
    return `${date}|${teams}`
  }
  return `${date}|${normalizeSummary(candidate.summary)}`
}

export async function discoverAcrossVenues(
  venues: DiscoveryVenue[],
  discoveryHint?: string | null,
  includeExisting = false
): Promise<DiscoveryBatchResult> {
  const results: DiscoveryCandidate[] = []
  let totalExisting = 0

  // Track cross-venue keys to flag duplicates across different venues
  const crossVenueSeen = new Map<string, { venue_id: string; venue_name: string }>()

  for (const venue of venues) {
    const venueResult = await discoverForVenue(venue, discoveryHint, includeExisting)

    for (const candidate of venueResult.discovered) {
      if (candidate.duplicate) {
        results.push(candidate)
        continue
      }

      const crossKey = buildCrossVenueKey(candidate)
      const existing = crossVenueSeen.get(crossKey)
      if (existing && existing.venue_id !== candidate.venue_id) {
        results.push({
          ...candidate,
          duplicate: true,
          duplicate_reason: `Same event already discovered at ${existing.venue_name}`,
        })
      } else {
        if (!existing) crossVenueSeen.set(crossKey, { venue_id: candidate.venue_id, venue_name: candidate.venue_name })
        results.push(candidate)
      }
    }

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
       COALESCE(v.venue_type, 'sports') as venue_type,
       v.feed_url,
       COALESCE(v.feed_type, 'other') as feed_type,
       v.slack_channel_id,
       COALESCE(v.requires_assignment, true) as requires_assignment,
       ${buildAutomationSelect('v', 'vs', 'st')},
       COALESCE(array_remove(array_agg(DISTINCT e.league), NULL), '{}') as likely_leagues
     FROM venues v
     LEFT JOIN markets m ON v.market_id = m.id
     LEFT JOIN client_venues cv ON cv.venue_id = v.id
     LEFT JOIN client_services vs ON vs.client_id = cv.client_id
     LEFT JOIN service_types st ON st.id = vs.service_type_id
     LEFT JOIN events e ON e.venue_id = v.id AND e.league IS NOT NULL
     WHERE v.id = $1
     GROUP BY v.id, m.name`,
    [venueId]
  )
  return result.rows[0] ? withComputedAutomation(result.rows[0]) : null
}

export async function getActiveDiscoveryVenues(): Promise<DiscoveryVenue[]> {
  const result = await query(
    `SELECT
       v.id,
       v.name,
       v.address,
       m.name as market_name,
       COALESCE(v.venue_type, 'sports') as venue_type,
       v.feed_url,
       COALESCE(v.feed_type, 'other') as feed_type,
       v.slack_channel_id,
       COALESCE(v.requires_assignment, true) as requires_assignment,
       ${buildAutomationSelect('v', 'vs', 'st')},
       COALESCE(array_remove(array_agg(DISTINCT e.league), NULL), '{}') as likely_leagues
     FROM venues v
     LEFT JOIN markets m ON v.market_id = m.id
     LEFT JOIN client_venues cv ON cv.venue_id = v.id
     LEFT JOIN client_services vs ON vs.client_id = cv.client_id
     LEFT JOIN service_types st ON st.id = vs.service_type_id
     LEFT JOIN events e ON e.venue_id = v.id AND e.league IS NOT NULL
     WHERE COALESCE(v.is_active, true) = true
     GROUP BY v.id, m.name
     ORDER BY
       CASE
         WHEN LOWER(v.name) = 'prudential center' THEN 0
         WHEN LOWER(v.name) = 'fenway park' THEN 1
         ELSE 2
       END,
       v.name`
  )
  return result.rows.map(withComputedAutomation)
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
  const automationByVenue = new Map<string, Awaited<ReturnType<typeof getVenueAutomationInfo>>>()
  const venueTimezoneCache = new Map<string, string>()
  let imported = 0
  let skipped = 0

  for (const event of payload.events) {
    const venueId = event.venue_id || payload.defaultVenueId
    if (!venueId || !event.summary || !event.event_date) {
      skipped++
      continue
    }
    if (!automationByVenue.has(venueId)) {
      automationByVenue.set(venueId, await getVenueAutomationInfo(venueId))
    }
    const automation = automationByVenue.get(venueId)!
    if ((automation.venue_type || 'sports') !== 'sports' && event.event_type === 'game') {
      skipped++
      continue
    }

    let venueTimezone: string = venueTimezoneCache.get(venueId) || ''
    if (!venueTimezone) {
      const tzRes = await query(`SELECT timezone FROM venues WHERE id = $1`, [venueId])
      venueTimezone = tzRes.rows[0]?.timezone || 'America/New_York'
      venueTimezoneCache.set(venueId, venueTimezone)
    }

    const existing = await loadExistingEvents(venueId, event.event_date, event.event_date)
    const hydrated = { ...event, venue_id: venueId }
    const dup = findDuplicate(hydrated, existing)
    if (dup.duplicate) {
      skipped++
      continue
    }

    // Cross-venue dedup: check if the same game exists at another venue on the same date
    if (event.home_team && event.away_team) {
      const crossResult = await query(
        `SELECT id, venue_id FROM events
         WHERE event_date = $1
           AND venue_id != $2
           AND LOWER(summary) LIKE $3
         LIMIT 1`,
        [event.event_date, venueId, `%${event.away_team.toLowerCase().split(' ').pop()}%${event.home_team.toLowerCase().split(' ').pop()}%`]
      )
      if (crossResult.rows.length > 0) {
        skipped++
        continue
      }
    }

    // Resolve to a proper UTC instant. If the candidate already carries a
    // full UTC ISO (e.g. MLB statsapi), trust it. Otherwise treat the HH:MM
    // as wall-clock in the venue's timezone.
    let startUtc: Date
    if (event.start_iso) {
      startUtc = new Date(event.start_iso)
    } else if (event.start_time) {
      startUtc = combineLocalToUtc(event.event_date, event.start_time, venueTimezone)
        ?? new Date(`${event.event_date}T00:00:00Z`)
    } else {
      startUtc = combineLocalToUtc(event.event_date, '00:00', venueTimezone)
        ?? new Date(`${event.event_date}T00:00:00Z`)
    }

    let endUtc: Date
    if (event.end_iso) {
      endUtc = new Date(event.end_iso)
    } else if (event.end_time) {
      endUtc = combineLocalToUtc(event.event_date, event.end_time, venueTimezone)
        ?? new Date(startUtc.getTime() + 3 * 3600_000)
    } else {
      endUtc = new Date(startUtc.getTime() + 3 * 3600_000)
    }
    if (endUtc.getTime() <= startUtc.getTime()) {
      endUtc = new Date(startUtc.getTime() + 3 * 3600_000)
    }

    const clientResult = await query(
      `SELECT
         (ARRAY_AGG(DISTINCT cv.client_id ORDER BY cv.client_id))[1] as client_id,
         COUNT(DISTINCT cv.client_id)::int as client_count
       FROM client_venues cv
       WHERE cv.venue_id = $1`,
      [venueId]
    )
    const resolvedClientId = Number(clientResult.rows[0]?.client_count || 0) === 1
      ? clientResult.rows[0]?.client_id || null
      : null

    const result = await query(
      `INSERT INTO events (
         summary, event_date, start_time, end_time, venue_id, client_id, league,
         workflow_status, event_type, source, requires_staffing
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
       RETURNING id`,
      [
        event.summary,
        event.event_date,
        startUtc,
        endUtc,
        venueId,
        resolvedClientId,
        event.league || null,
        event.event_type,
        event.source || 'ai_discovery',
        automation.requires_staffing_default,
      ]
    )

    eventIds.push(result.rows[0].id)
    imported++
    byVenue[venueId] = (byVenue[venueId] || 0) + 1
  }

  return { imported, skipped, eventIds, byVenue }
}
