// Reject obviously-bogus event candidates before they hit `events`.
//
// Joe 2026-05-12: the daily event list pulled in Portland Trail Blazers (NBA
// reg-season over), Fresno State Football (off-season), Quinnipiac Basketball
// (off-season), Wyoming "Football Season Tickets On Sale" (sales page, not a
// game). All slipped past the existing duplicate / placeholder filters.
//
// Two checks:
//   1. JUNK_TITLE_PATTERN — titles that clearly aren't a game day (season
//      tickets, on sale, bye week, ticket info, etc.)
//   2. Sport-season window — football outside Aug-Jan, college basketball
//      outside Nov-Apr, etc. Windows are generous (cover playoffs / Finals)
//      so legit edge cases survive.

export interface SanityCandidate {
  summary?: string | null
  league?: string | null
  event_date?: string | null
  event_type?: string | null
}

// Title fragments that mark a row as not-a-game even if the team / league
// looks legit. Case-insensitive.
const JUNK_TITLE_PATTERN = /\b(season tickets?|tickets on sale|on sale now|on sale today|bye week|bye-week|season pass(?:es)?|single[- ]game tickets?|ticket info(?:rmation)?|tba opponent|tbd opponent|opponent tbd|opponent tba|opponent\s*:\s*(tba|tbd)|home (game|opener|finale)\s*(tba|tbd)|date\s+(?:tba|tbd)|presale|pre-?sale|deposit|merchandise|wait[- ]?list|fan ?fest|media day|hall of fame|preview|recap|reset)\b/i

// 1-indexed months in which the sport's regular or post-season is plausibly
// active. Endpoints inclusive. Wrap-around (e.g. Aug-Feb) handled in code.
type SportKey =
  | 'nfl'
  | 'cfb'
  | 'nba'
  | 'wnba'
  | 'nhl'
  | 'mlb'
  | 'milb'
  | 'ncaa_basketball'
  | 'ncaa_baseball'
  | 'ncaa_softball'
  | 'ncaa_hockey'
  | 'mls'
  | 'nwsl'

const SEASON_WINDOWS: Record<SportKey, { startMonth: number; endMonth: number }> = {
  nfl: { startMonth: 8, endMonth: 2 },           // preseason Aug -> Super Bowl Feb
  cfb: { startMonth: 8, endMonth: 1 },           // bowl games into early Jan
  nba: { startMonth: 10, endMonth: 6 },          // preseason Oct -> Finals Jun
  wnba: { startMonth: 5, endMonth: 10 },         // May -> Finals Oct
  nhl: { startMonth: 9, endMonth: 6 },           // preseason Sep -> Cup Jun
  mlb: { startMonth: 3, endMonth: 11 },          // ST late Mar -> WS Nov
  milb: { startMonth: 4, endMonth: 9 },          // Apr -> mid-Sep
  ncaa_basketball: { startMonth: 11, endMonth: 4 }, // Nov -> Final Four early Apr
  ncaa_baseball: { startMonth: 2, endMonth: 6 },    // Feb -> CWS Jun
  ncaa_softball: { startMonth: 2, endMonth: 6 },    // Feb -> WCWS Jun
  ncaa_hockey: { startMonth: 10, endMonth: 4 },     // Oct -> Frozen Four early Apr
  mls: { startMonth: 2, endMonth: 12 },             // late Feb -> MLS Cup Dec
  nwsl: { startMonth: 3, endMonth: 11 },            // Mar -> Champ Nov
}

function inferSport(summary: string, league: string | null | undefined): SportKey | null {
  const text = `${league || ''} ${summary || ''}`.toLowerCase()

  // Football: NFL or NCAA. Watch out for "Football Club" which is soccer.
  if (/\bnfl\b/.test(text)) return 'nfl'
  if (/\bncaaf\b|college football|\bfbs\b|\bfcs\b/.test(text)) return 'cfb'
  if (/\bfootball\b/.test(text) && !/football club|\bfc\b/.test(text)) {
    // College football leagues / conferences without explicit "NCAA"
    if (/mountain west|big ten|sec|acc|pac-?12|big 12|aac|sun belt|mac\b|c-?usa|mwc|ivy|patriot league|colonial athletic/.test(text)) return 'cfb'
    if (/college|ncaa|university|state\b/.test(text)) return 'cfb'
    return 'nfl' // generic "football" left over — assume NFL
  }

  // Basketball
  if (/\bnba\b/.test(text)) return 'nba'
  if (/\bwnba\b/.test(text)) return 'wnba'
  if (/\bncaab\b|college basketball/.test(text)) return 'ncaa_basketball'
  if (/basketball/.test(text)) {
    if (/college|ncaa|university|men'?s basketball|women'?s basketball/.test(text)) return 'ncaa_basketball'
    return 'nba'
  }

  // Hockey
  if (/\bnhl\b/.test(text)) return 'nhl'
  if (/ice hockey|men'?s hockey|women'?s hockey/.test(text)) return 'ncaa_hockey'
  if (/\bhockey\b/.test(text)) return 'nhl'

  // Baseball / Softball
  if (/\bmlb\b/.test(text)) return 'mlb'
  if (/\bmilb\b|minor league baseball|triple-?a\b|double-?a\b|single-?a\b/.test(text)) return 'milb'
  if (/college baseball|ncaa baseball/.test(text)) return 'ncaa_baseball'
  if (/college softball|ncaa softball|softball/.test(text)) return 'ncaa_softball'
  if (/baseball/.test(text)) {
    if (/college|ncaa|university/.test(text)) return 'ncaa_baseball'
    return 'mlb'
  }

  // Soccer
  if (/\bmls\b/.test(text)) return 'mls'
  if (/\bnwsl\b/.test(text)) return 'nwsl'

  return null
}

function monthFromIsoDate(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  const m = parseInt(match[2], 10)
  if (m < 1 || m > 12) return null
  return m
}

function isMonthInWindow(month: number, startMonth: number, endMonth: number): boolean {
  if (startMonth <= endMonth) {
    return month >= startMonth && month <= endMonth
  }
  // Wrap-around (e.g. Aug-Feb).
  return month >= startMonth || month <= endMonth
}

export function checkEventSanity(candidate: SanityCandidate): { valid: true } | { valid: false; reason: string } {
  const summary = (candidate.summary || '').trim()
  if (!summary) return { valid: false, reason: 'Empty summary' }

  if (JUNK_TITLE_PATTERN.test(summary)) {
    return { valid: false, reason: `Non-game title pattern: ${summary}` }
  }

  // Only enforce season window for game-type events. Concerts, theatre,
  // graduations, etc. happen year-round at sports venues.
  const eventType = (candidate.event_type || '').toLowerCase()
  if (eventType && eventType !== 'game') return { valid: true }

  const sport = inferSport(summary, candidate.league)
  if (!sport) return { valid: true }

  if (!candidate.event_date) return { valid: true }
  const month = monthFromIsoDate(candidate.event_date)
  if (month === null) return { valid: true }

  const window = SEASON_WINDOWS[sport]
  if (!isMonthInWindow(month, window.startMonth, window.endMonth)) {
    return {
      valid: false,
      reason: `${sport} game on ${candidate.event_date} is outside the typical ${window.startMonth}-${window.endMonth} season window`,
    }
  }

  return { valid: true }
}
