/**
 * Venue Reference — the rules behind the badges.
 *
 * Steve Solomson's 2026-08-25 outline asks for three judgements the dashboard
 * has never made: is this venue ready for its season, is this box on the
 * version it should be on, and has this number called about this venue before.
 * Each one is a small decision that appears on screen as a coloured word, and
 * a coloured word that is wrong is worse than no word — a tech who trusts
 * "Up to date" and finds 4.0 on a wall has stopped trusting the page.
 *
 * So the rules live here as pure functions, with the edge cases written down
 * and tested, rather than inline in a component where nobody can see them.
 */

export type VersionStatus = 'up_to_date' | 'update_due' | 'overdue' | 'unknown'

/** How long before a season opens that a venue should have been checked. */
export const DEFAULT_LEAD_DAYS = 45

const DAY_MS = 86_400_000

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The next time this season opens, on or after `now`.
 *
 * A season start is stored as a real date but read as a month-and-day that
 * comes round every year — a venue whose season opened 2025-09-01 opens again
 * 2026-09-01, and the row is not stale for it.
 *
 * Feb 29 is deliberately allowed to land on Mar 1 in a common year rather than
 * being dropped; a season boundary a day out changes no decision here.
 */
export function nextSeasonStart(seasonStart: Date | string, now: Date): Date {
  const s = asDate(seasonStart)!
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0,
  ))
  if (candidate.getTime() < Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
  )) {
    candidate.setUTCFullYear(candidate.getUTCFullYear() + 1)
  }
  return candidate
}

/**
 * Whether a venue's recorded versions are current enough for its next season.
 *
 * The ladder, in order:
 *  1. No season on file, or never checked → `unknown`. Not a failure — nobody
 *     has said anything about this venue yet, and colouring that red would
 *     paint 251 venues red on day one.
 *  2. Last checked before the PREVIOUS season opened → `overdue`. A whole
 *     season has come and gone since anyone looked.
 *  3. Inside the run-up to the next season and not checked since it opened →
 *     `update_due`. This is the window Steve is actually asking about.
 *  4. Otherwise → `up_to_date`.
 */
export function versionStatus(
  seasonStart: Date | string | null | undefined,
  checkedAt: Date | string | null | undefined,
  now: Date = new Date(),
  leadDays: number = DEFAULT_LEAD_DAYS,
): VersionStatus {
  const season = asDate(seasonStart)
  const checked = asDate(checkedAt)
  if (!season || !checked) return 'unknown'

  const next = nextSeasonStart(season, now)
  const previous = new Date(next.getTime())
  previous.setUTCFullYear(previous.getUTCFullYear() - 1)

  if (checked.getTime() < previous.getTime()) return 'overdue'

  const windowOpens = new Date(next.getTime() - leadDays * DAY_MS)
  if (now.getTime() >= windowOpens.getTime() && checked.getTime() < windowOpens.getTime()) {
    return 'update_due'
  }
  return 'up_to_date'
}

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  up_to_date: 'Up to date',
  update_due: 'Update due',
  overdue: 'Overdue',
  unknown: 'Not reviewed',
}

export type SoftwareStatus = 'current' | 'update_available' | 'no_target' | 'unknown'

const normalizeVersion = (v: string): string =>
  v.trim().toLowerCase().replace(/^v(?=\d)/, '')

const NUMERIC_VERSION = /^\d+(\.\d+)*$/

/**
 * Installed against latest.
 *
 * `4.2` and `4.2.0` are the same firmware written two ways, so a dotted
 * numeric pair is compared segment by segment with missing segments read as
 * zero. Anything that is not purely numeric ("A8S-N build 3", "2026.07-rc1")
 * is compared as text — guessing an order for those would invent a fact.
 */
export function softwareStatus(
  installed: string | null | undefined,
  latest: string | null | undefined,
): SoftwareStatus {
  const target = (latest || '').trim()
  if (!target) return 'no_target'
  const have = (installed || '').trim()
  if (!have) return 'unknown'

  const a = normalizeVersion(have)
  const b = normalizeVersion(target)
  if (a === b) return 'current'

  if (NUMERIC_VERSION.test(a) && NUMERIC_VERSION.test(b)) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
      const x = pa[i] ?? 0
      const y = pb[i] ?? 0
      if (x !== y) return x > y ? 'current' : 'update_available'
    }
    // Equal once padded — 4.2 and 4.2.0.
    return 'current'
  }
  return 'update_available'
}

/**
 * A caller's number reduced to the key we match on.
 *
 * The intake writes numbers in whatever shape they arrive — "(404) 555-1212",
 * "+1 404 555 1212", "4045551212" — and the same tech reaching us twice must
 * land on the same key both times. Returns null for anything that is not a
 * usable North American number, including the literal "Unknown" the phone
 * system sends when it has no caller ID (88 of 315 voicemails on file).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D+/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  if (digits.length === 10) return digits
  return null
}

/** "(404) 555-1212" from a normalized key, for display. */
export function formatPhone(key: string | null | undefined): string {
  if (!key || key.length !== 10) return key || ''
  return `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`
}

export type PhoneMatch = {
  venue_id: string
  venue_name?: string
  call_count: number
  last_seen_at: string | Date
  origin: string
}

/**
 * The order the venue picker offers matches in.
 *
 * A human-confirmed link outranks one inferred from ticket history however
 * many times the inferred one has been seen — somebody said "this number is
 * Fenway", and a backfill guess does not get to argue. Within a tier the
 * busier and more recent number wins.
 */
export function rankPhoneMatches<T extends PhoneMatch>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ca = a.origin === 'confirmed' ? 1 : 0
    const cb = b.origin === 'confirmed' ? 1 : 0
    if (ca !== cb) return cb - ca
    if (a.call_count !== b.call_count) return b.call_count - a.call_count
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  })
}

/**
 * Whether the dashboard should jump straight to a venue or ask.
 *
 * One match goes straight there. Two or more means the number has called about
 * several venues, and picking for the tech would silently attach a ticket to
 * the wrong building — so it asks. Steve's outline says exactly this.
 */
export function phoneDecision<T extends PhoneMatch>(matches: T[]): {
  action: 'none' | 'go' | 'choose'
  venue?: T
  options: T[]
} {
  const ranked = rankPhoneMatches(matches)
  if (ranked.length === 0) return { action: 'none', options: [] }
  if (ranked.length === 1) return { action: 'go', venue: ranked[0], options: ranked }
  return { action: 'choose', options: ranked }
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'it', 'its', 'this',
  'that', 'we', 'i', 'you', 'they', 'he', 'she', 'my', 'our', 'your', 'their',
  'have', 'has', 'had', 'not', 'no', 'can', 'will', 'would', 'should', 'could',
  'please', 'hi', 'hey', 'hello', 'thanks', 'thank', 'call', 'called', 'calling',
  'back', 'me', 'us', 'about', 'just', 'get', 'got', 'now', 'up', 'out', 'so',
  'there', 'here', 'im', 'ive', 'dont', 'doesnt', 'isnt', 'thats', 'voicemail',
])

/** Words worth matching on — short and common ones carry no signal. */
export function keywords(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue
    if (STOPWORDS.has(raw)) continue
    seen.add(raw)
  }
  return [...seen]
}

/**
 * How strongly a past ticket or known issue matches what the caller said.
 *
 * Deliberately a keyword score and nothing cleverer: it runs on every incoming
 * voicemail with no model call, no cost and no latency, and it is honest about
 * what it is. Longer words score higher because "processor" tells you more
 * than "wall". The result is a 0-1 share of the caller's own vocabulary, so a
 * transcript that happens to be long does not out-score a short precise one.
 */
export function matchScore(
  transcript: string | null | undefined,
  candidate: string | null | undefined,
): number {
  const a = keywords(transcript)
  if (!a.length) return 0
  const b = new Set(keywords(candidate))
  if (!b.size) return 0

  let hit = 0
  let total = 0
  for (const word of a) {
    const weight = word.length >= 8 ? 3 : word.length >= 5 ? 2 : 1
    total += weight
    if (b.has(word)) hit += weight
  }
  return total === 0 ? 0 : hit / total
}

/** Below this a "related issue" suggestion is noise, so it is not shown. */
export const MATCH_THRESHOLD = 0.18

export type Suggestion<T> = { item: T; score: number }

export function rankMatches<T>(
  transcript: string | null | undefined,
  candidates: T[],
  textOf: (item: T) => string,
  limit = 5,
): Suggestion<T>[] {
  return candidates
    .map((item) => ({ item, score: matchScore(transcript, textOf(item)) }))
    .filter((s) => s.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Reads a version out of what a tech typed when closing a ticket.
 *
 * Steve's example is "CMS updated to v4.2" — a tech who writes that has
 * already said everything the Software tab needs, and making them fill a
 * second field to repeat it is the manual step the feature exists to remove.
 *
 * Returns nothing unless the sentence actually reports a CHANGE. "Confirmed
 * the CMS is still on 4.1" mentions a version and changes nothing; writing it
 * into the record as an update would make the history lie.
 */
const UPGRADE_VERBS = /\b(updated?|upgraded?|flashed|installed|bumped|now on|moved to)\b/i

const UPGRADE_PATTERNS: Array<{ key: 'cms' | 'led'; re: RegExp }> = [
  { key: 'cms', re: /\bcms\b[^.\n]{0,30}?\b(?:to|=|at|version|v)?\s*v?(\d+(?:\.\d+){0,3})\b/i },
  { key: 'led', re: /\b(?:led|firmware|fw)\b[^.\n]{0,30}?\b(?:to|=|at|version|v)?\s*v?(\d+(?:\.\d+){0,3})\b/i },
]

export function readVersionsFromNote(note: string | null | undefined): {
  cms_version?: string
  led_firmware_version?: string
} {
  const out: { cms_version?: string; led_firmware_version?: string } = {}
  const text = String(note || '')
  if (!text.trim()) return out
  if (!UPGRADE_VERBS.test(text)) return out

  for (const { key, re } of UPGRADE_PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    if (key === 'cms') out.cms_version = m[1]
    else out.led_firmware_version = m[1]
  }
  return out
}

/**
 * Sport section ordering for the all-venues page.
 *
 * Alphabetical would open the list on AHL and bury the NFL. The leagues ANC
 * actually works in lead, in roughly the order the business thinks about them,
 * and anything unrecognised follows alphabetically. Venues with no sport on
 * file go last — an unfilled field is not a category.
 */
export const SPORT_ORDER = [
  'NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'NCAA', 'WNBA', 'AHL', 'MiLB', 'NWSL', 'USL',
]

export const NO_SPORT_LABEL = 'No sport on file'

export function orderSports(sports: string[]): string[] {
  const rank = new Map(SPORT_ORDER.map((s, i) => [s.toUpperCase(), i]))
  return [...sports].sort((a, b) => {
    if (a === NO_SPORT_LABEL) return 1
    if (b === NO_SPORT_LABEL) return -1
    const ra = rank.has(a.toUpperCase()) ? rank.get(a.toUpperCase())! : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.toUpperCase()) ? rank.get(b.toUpperCase())! : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, 'en', { sensitivity: 'base' })
  })
}
