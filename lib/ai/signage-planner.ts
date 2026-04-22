// ─────────────────────────────────────────────────────────────────
// signage-planner.ts — Deterministic venue-signage planning engine
//
// This is the production-design brain that sits BETWEEN the raw
// request and any image-generation call. It classifies the request,
// builds a structured board-by-board plan, writes a creative brief,
// and produces the final image prompt — all with safeguards that
// prevent generic "AI slop" poster output.
//
// Every function here is pure / deterministic. No LLM calls, no
// randomness. The same input always produces the same plan.
// ─────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────

export type RequestType =
  | 'final_score'
  | 'countdown'
  | 'matchup'
  | 'sponsor_board'
  | 'logo_loop'
  | 'fascia_pattern'
  | 'multi_board_package'

export type BoardType =
  | 'main_board'
  | 'fascia'
  | 'side_panel'
  | 'stat_area'
  | 'corner_board'
  | 'custom_zone'

export type MessageMode =
  | 'single_message'
  | 'score_first'
  | 'timer_first'
  | 'logo_repeat'
  | 'pattern_repeat'

export type Priority = 'high' | 'medium' | 'low'

export interface DesignContext {
  title: string
  client: string | null
  tricode: string | null
  venue: string | null
  boards: string | null
  sizes: string | null
  notes: string | null
}

export interface ZoneBand {
  start_pct: number
  end_pct: number
  note: string
}

export interface SafeZone {
  top_pct: number
  right_pct: number
  bottom_pct: number
  left_pct: number
  note: string
}

export interface ContentStrategy {
  primary_focus: string
  secondary_focus: string
  layout_pattern: string
  repetition_mode: 'repeat' | 'none'
  max_message_units: number
  anchor_preference: string
  allowed_elements: string[]
  forbidden_elements: string[]
  avoid_regions: string[]
}

export interface BoardPlan {
  board_name: string
  width: number
  height: number
  aspect_ratio: number
  board_type: BoardType
  safe_zones: SafeZone
  bend_zones: ZoneBand[]
  camera_breaks: ZoneBand[]
  constraints_summary: string[]
  content_strategy: ContentStrategy
}

export interface CreativeBrief {
  primary_message: string
  secondary_message: string
  numeric_priority: Priority
  logo_priority: Priority
  sponsor_placement: string
  screen_specific_adaptation_strategy: string[]
}

export interface ProofPlan {
  board_label: string
  dimensions: string
  bend_marker: string
  safe_content_area: string
  simplified_proof_preview: string
  content_modules: string[]
  production_notes: string[]
  export_metadata: {
    filename_stub: string
    aspect_ratio: string
    board_type: BoardType
    usable_width_px: number
    usable_height_px: number
  }
}

export interface ConceptSystem {
  art_direction: string
  palette: string[]
  typography: string
  texture: string
  hierarchy: string
}

export interface NormalizedRequest {
  summary: string
  primary_intent: string
  message_mode: MessageMode
  explicit_constraints: string[]
  assumptions: string[]
  hero_image_allowed: boolean
}

export interface ProofSheetConfig {
  layout_style: string
  annotation_style: string
  include_dimensions: boolean
  include_safe_areas: boolean
  include_bend_markers: boolean
}

export interface PackagePlan {
  planning_version: 'v3'
  generation_mode: 'venue_signage_package'
  request_type: RequestType
  sport: string | null
  event_type: string | null
  home_team: string | null
  away_team: string | null
  score_or_countdown: string | null
  sponsor: string | null
  venue_name: string | null
  normalized_request: NormalizedRequest
  concept_system: ConceptSystem
  creative_brief: CreativeBrief
  proof_sheet: ProofSheetConfig
  boards: BoardPlan[]
  proofs: ProofPlan[]
  safeguards: string[]
}

// ── Visual Systems ───────────────────────────────────────────────
// Pre-defined concept systems keyed by sport + event energy.
// These keep the output anchored to real arena-design language
// instead of letting the image model invent random aesthetics.

interface ConceptPreset {
  art_direction: string
  palette: string[]
  typography: string
  texture: string
  hierarchy: string
}

const CONCEPT_PRESETS: Record<string, ConceptPreset> = {
  hockey: {
    art_direction: 'Ice-rink signage package with hard-edged broadcast energy. Dark base, high-contrast white and orange elements. Think NHL scoreboard, not social media.',
    palette: ['charcoal black', 'white', 'arena orange accent', 'ice blue highlight'],
    typography: 'Extra-condensed bold display caps for scores and labels, secondary in compressed medium weight.',
    texture: 'Subtle frost grain in dark zones only; clean solid fill on type. No grunge over data.',
    hierarchy: 'Score or timer dominates center. Team wordmarks anchor sides. Sponsor lockup bottom-safe only.',
  },
  basketball: {
    art_direction: 'Hardwood-court signage package with bold condensed type. Dark base, orange/white accents. Think NBA courtside LED energy, not Instagram.',
    palette: ['deep black', 'white', 'arena orange', 'warm amber highlight'],
    typography: 'Ultra-condensed bold for numerals and short labels. Regular condensed for secondary copy.',
    texture: 'Hardwood-grain texture band at margins only; clean data zones. No distressed overlays.',
    hierarchy: 'Single dominant message per board. Score or matchup centered. Sponsor in protected corner lockup.',
  },
  football: {
    art_direction: 'Gridiron signage package with scoreboard-broadcast authority. Dark textured base, strong white/orange type. NFL-style stat boards, not hype posters.',
    palette: ['charcoal black', 'white', 'arena orange', 'gold accent on sponsor lockup'],
    typography: 'Tall condensed bold for yard lines and scores. Compressed medium for team names and clocks.',
    texture: 'Turf-line texture at 5% opacity in dark zones only. Clean typography zones. No lens flare.',
    hierarchy: 'Yard line / score dominant. Down-and-distance secondary. Sponsor below safe line.',
  },
  baseball: {
    art_direction: 'Ballpark signage package with clean scoreboard readability. Dark base, white and orange type. Think MLB stat board, not marketing creative.',
    palette: ['deep charcoal', 'white', 'arena orange', 'navy blue secondary'],
    typography: 'Wide condensed bold for scores and line scores. Regular condensed for player names.',
    texture: 'Minimal — clean fill zones with subtle stitching-line accent at margins. No weathering.',
    hierarchy: 'Line score or count dominant center. Team marks side-anchored. Sponsor subtle lower-right.',
  },
  soccer: {
    art_direction: 'Pitch-side LED signage package with broadcast-clean type. Dark base, white primary, orange accent. Think MLS scoreboard, not World Cup poster.',
    palette: ['deep black', 'white', 'arena orange', 'pitch green accent'],
    typography: 'Semi-condensed bold for clock and score. Compressed regular for commentary and stats.',
    texture: 'Clean minimal fill. Subtle gradient band at base. No pattern distraction.',
    hierarchy: 'Clock and score centered. Team badges side-anchored. Sponsor in bottom-safe repeat strip.',
  },
  lacrosse: {
    art_direction: 'Fieldhouse signage package with hard-sport broadcast energy. Dark base, high-contrast white and orange. Arena LED style, not event poster.',
    palette: ['charcoal', 'white', 'arena orange', 'teal accent'],
    typography: 'Condensed bold caps for scores and labels. Medium weight for secondary info.',
    texture: 'Minimal texture — clean fill with subtle grid-line accents. No distressed type.',
    hierarchy: 'Score or matchup dominant center. Sponsor bottom-safe. Team marks in protected side zones.',
  },
  default: {
    art_direction: 'Dark textured sports-broadcast signage package with one clear message per screen and premium in-venue playback energy.',
    palette: ['charcoal black', 'white', 'arena orange accent'],
    typography: 'Condensed bold display type with broadcast-safe secondary text.',
    texture: 'Subtle grit / scoreboard grid / fieldhouse texture only where it supports readability.',
    hierarchy: 'Single dominant message, secondary support line, restrained sponsor/logo treatment.',
  },
}

const EVENT_ENERGY_OVERRIDES: Record<string, Partial<ConceptPreset>> = {
  'home opener': {
    art_direction: 'Home-opener signage package with elevated energy — premium dark base, bolder orange, "home opener" as hero text. Arena-ready, not social-media.',
    palette: ['deep black', 'white', 'arena orange', 'metallic gold accent'],
  },
  'playoff game': {
    art_direction: 'Playoff-signage package with championship-broadcast authority. Premium dark base, commanding white and orange. Postseason LED energy, not hype art.',
    palette: ['deep black', 'white', 'arena orange', 'championship gold accent'],
  },
  finals: {
    art_direction: 'Finals signage package with ultimate broadcast authority. Rich dark base, commanding white/orange/gold. Championship-level LED composition.',
    palette: ['deep black', 'white', 'arena orange', 'championship gold', 'silver accent'],
  },
}

// ── Board-Type Decision Rules ─────────────────────────────────────
//
// Each board type has deterministic rules for what content it can
// carry and how it must be composed. These are the guardrails that
// prevent the image model from treating a 384x64 ribbon like a
// 1920x1080 poster.

export const BOARD_RULES: Record<BoardType, {
  description: string
  max_message_units: number
  repetition_mode: 'repeat' | 'none'
  allowed_elements: string[]
  forbidden_elements: string[]
  safe_zone_defaults: SafeZone
  assumed_bend_zones: ZoneBand[]
  assumed_camera_breaks: ZoneBand[]
}> = {
  main_board: {
    description: 'Primary center-hung or courtside LED display. Landscape orientation. Carries the hero message.',
    max_message_units: 1,
    repetition_mode: 'none',
    allowed_elements: ['one headline', 'one support line', 'team marks', 'restrained sponsor lockup', 'score bug', 'countdown timer', 'grid/scoreboard cues'],
    forbidden_elements: ['photo-collage layout', 'multiple competing headlines', 'social-style sticker clutter', 'dense paragraph copy', 'small sponsor logos without lockup'],
    safe_zone_defaults: { top_pct: 6, right_pct: 6, bottom_pct: 8, left_pct: 6, note: 'Standard production-safe margin for arena LED proofs.' },
    assumed_bend_zones: [],
    assumed_camera_breaks: [],
  },
  fascia: {
    description: 'Long-run ribbon/fascia/dasher LED. Extreme aspect ratio (4:1+). Content must be modular and repeatable.',
    max_message_units: 1,
    repetition_mode: 'repeat',
    allowed_elements: ['repeating logos', 'short wordmarks', 'pattern bands', 'score fragments only if oversized', 'sponsor beat as a secondary repeat', 'directional chevrons', 'team color bars'],
    forbidden_elements: ['dense copy', 'paragraph text', 'small sponsor lockups', 'busy background illustration', 'cross-seam message locks', 'landscape photography', 'multi-line text blocks'],
    safe_zone_defaults: { top_pct: 18, right_pct: 4, bottom_pct: 18, left_pct: 4, note: 'Protect top/bottom edges and keep critical copy out of long-run seams.' },
    assumed_bend_zones: [{ start_pct: 48, end_pct: 52, note: 'Assumed center bend/seam. Keep critical content out of this zone.' }],
    assumed_camera_breaks: [],
  },
  side_panel: {
    description: 'Narrow vertical or portrait-orientation panel. Stacked logo/message system.',
    max_message_units: 1,
    repetition_mode: 'none',
    allowed_elements: ['one dominant word or number', 'stacked team marks', 'single sponsor lockup', 'directional bars', 'compact date/time'],
    forbidden_elements: ['landscape composition', 'crowded matchup rows', 'small decorative details', 'wide aspect ratio layouts'],
    safe_zone_defaults: { top_pct: 8, right_pct: 8, bottom_pct: 8, left_pct: 8, note: 'Keep stacked message system centered and vertically balanced.' },
    assumed_bend_zones: [],
    assumed_camera_breaks: [],
  },
  stat_area: {
    description: 'Data display zone — scores, stats, line scores. Numeric-first composition.',
    max_message_units: 1,
    repetition_mode: 'none',
    allowed_elements: ['large numerals', 'team abbreviations', 'final label', 'compact dividers', 'clock digits', 'stat labels'],
    forbidden_elements: ['hero imagery', 'ornamental textures over numbers', 'multi-line copy blocks', 'decorative backgrounds over data zones'],
    safe_zone_defaults: { top_pct: 5, right_pct: 5, bottom_pct: 5, left_pct: 5, note: 'Minimal margins for maximum data area. Keep numerals crisp.' },
    assumed_bend_zones: [],
    assumed_camera_breaks: [],
  },
  corner_board: {
    description: 'Corner or transition board. Often odd geometry. Same rules as side panel but more constrained.',
    max_message_units: 1,
    repetition_mode: 'none',
    allowed_elements: ['one dominant word or number', 'stacked logo', 'single sponsor lockup', 'directional arrow or icon'],
    forbidden_elements: ['landscape composition', 'crowded matchup rows', 'small decorative details', 'wide aspect ratio layouts'],
    safe_zone_defaults: { top_pct: 10, right_pct: 10, bottom_pct: 10, left_pct: 10, note: 'Generous margins for constrained corner geometry.' },
    assumed_bend_zones: [{ start_pct: 48, end_pct: 52, note: 'Assumed corner seam. Keep critical content away from center.' }],
    assumed_camera_breaks: [],
  },
  custom_zone: {
    description: 'Custom zone board with unknown geometry. Conservative composition strategy.',
    max_message_units: 1,
    repetition_mode: 'none',
    allowed_elements: ['one headline', 'one support line', 'team mark', 'restrained sponsor lockup'],
    forbidden_elements: ['photo-collage layout', 'multiple competing headlines', 'social-style sticker clutter', 'dense copy blocks'],
    safe_zone_defaults: { top_pct: 8, right_pct: 8, bottom_pct: 8, left_pct: 8, note: 'Conservative safe margin for unknown board geometry.' },
    assumed_bend_zones: [],
    assumed_camera_breaks: [],
  },
}

// ── Request-Type Decision Rules ───────────────────────────────────

export const REQUEST_RULES: Record<RequestType, {
  primary: string
  secondary: string
  numeric_priority: Priority
  logo_priority: Priority
  message_mode: MessageMode
  description: string
}> = {
  final_score: {
    primary: 'Final score / teams / FINAL label',
    secondary: 'Sponsor lockup or venue line',
    numeric_priority: 'high',
    logo_priority: 'medium',
    message_mode: 'score_first',
    description: 'Final-score package: score must dominate, FINAL label must be unmissable, teams abbreviated.',
  },
  countdown: {
    primary: 'Timer / countdown value',
    secondary: 'Event label / opponent / date',
    numeric_priority: 'high',
    logo_priority: 'medium',
    message_mode: 'timer_first',
    description: 'Countdown package: timer number is the hero, event cue is secondary.',
  },
  matchup: {
    primary: 'Game-night matchup message',
    secondary: 'Venue / date / accent logos',
    numeric_priority: 'medium',
    logo_priority: 'medium',
    message_mode: 'single_message',
    description: 'Matchup package: two teams, one date, one clear message per board.',
  },
  sponsor_board: {
    primary: 'Event message with sponsor lockup',
    secondary: 'Sponsor presented-by treatment',
    numeric_priority: 'medium',
    logo_priority: 'medium',
    message_mode: 'single_message',
    description: 'Sponsor board: event message stays primary, sponsor is integrated but never overpowering.',
  },
  logo_loop: {
    primary: 'Repeated logo rhythm',
    secondary: 'Short phrase if space allows',
    numeric_priority: 'low',
    logo_priority: 'high',
    message_mode: 'logo_repeat',
    description: 'Logo loop: repeating team/sponsor logo on a cadence. Minimal text. Built for loop playback.',
  },
  fascia_pattern: {
    primary: 'Pattern / logo strip',
    secondary: 'One oversized short phrase max',
    numeric_priority: 'low',
    logo_priority: 'high',
    message_mode: 'pattern_repeat',
    description: 'Fascia pattern: rhythm-first composition using color, logo, and geometric pattern. Near-zero text.',
  },
  multi_board_package: {
    primary: 'Single clear event message',
    secondary: 'Adaptive sponsor / logo system',
    numeric_priority: 'medium',
    logo_priority: 'medium',
    message_mode: 'single_message',
    description: 'Multi-board package: one visual system adapted across all venue zones.',
  },
}

// ── Safeguards ────────────────────────────────────────────────────
// These are injected into the final image prompt AND returned in
// the plan for downstream consumers to enforce programmatically.

export const SIGNAGE_SAFEGUARDS = [
  'Do not generate a social-post poster, hero player artwork, or photoreal concept art unless the brief explicitly asks for it.',
  'Default to flat signage layouts with no people, no action photography, and no cinematic scene-building.',
  'No critical content across bends, seams, or camera breaks.',
  'Long narrow boards must use repetition, rhythm, logos, patterns, or one oversized short message.',
  'Keep typography distance-readable and production-safe.',
  'All boards must share one visual system adapted to geometry, not separate unrelated concepts.',
  'Never create a green Celtics poster, a blue Dodgers wallpaper, or any team-themed hype graphic — create venue LED signage.',
  'One message per screen. No competing headlines.',
  'Sponsor lockups must be restrained and anchored in protected corners or bottom-safe zones.',
  'Output must resemble operational in-venue playback, not concept art or marketing material.',
] as const

// ── Helper Functions ──────────────────────────────────────────────

function compact(value: string | null | undefined, max = 240): string {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : ''
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function splitLooseList(value: string | null | undefined): string[] {
  return (value || '')
    .split(/\n|,|;|\|/g)
    .map(part => part.trim())
    .filter(Boolean)
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(40, Math.round(value)))
}

function clampBandPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value)))
}

// ── Classifiers ────────────────────────────────────────────────────

export function inferSport(text: string): string | null {
  const lower = text.toLowerCase()
  if (/hockey|puck|rink|nhl|ice|flyers|penguins|rangers|bruins|blackhawks|avalanche/.test(lower)) return 'hockey'
  if (/basketball|hoops|nba|court|sixers|lakers|celtics|warriors|bulls/.test(lower)) return 'basketball'
  if (/football|kickoff|touchdown|nfl|eagles|chiefs|packers|cowboys|super bowl/.test(lower)) return 'football'
  if (/baseball|mlb|first pitch|phillies|yankees|dodgers|cubs|diamondbacks/.test(lower)) return 'baseball'
  if (/soccer|futbol|goal kick|mls|inter miami|lafc|atlanta united/.test(lower)) return 'soccer'
  if (/lacrosse|lax|pll|nll/.test(lower)) return 'lacrosse'
  return null
}

export function inferEventType(text: string): string | null {
  const lower = text.toLowerCase()
  if (/home opener/.test(lower)) return 'home opener'
  if (/playoff/.test(lower)) return 'playoff game'
  if (/finals|championship|stanley cup|nba finals/.test(lower)) return 'finals'
  if (/game night/.test(lower)) return 'game night'
  if (/final score|final\b/.test(lower)) return 'final score'
  if (/countdown|puck drop|tip-?off|kickoff/.test(lower)) return 'countdown'
  if (/youth|camp|clinic/.test(lower)) return 'youth event'
  return null
}

export function classifyRequest(ctx: DesignContext, boardCount: number): RequestType {
  const text = `${ctx.title} ${ctx.notes || ''} ${ctx.boards || ''}`.toLowerCase()
  if (/final score|\bfinal\b/.test(text) || /\b\d{1,3}\s*[-:]\s*\d{1,3}\b/.test(text)) return 'final_score'
  if (/countdown|puck drop|tip-?off|kickoff/.test(text) || /\b\d{1,2}:\d{2}\b/.test(text)) return 'countdown'
  if (/logo loop|repeating logo|logo strip/.test(text)) return 'logo_loop'
  if (/fascia pattern|pattern-based fascia|pattern only/.test(text)) return 'fascia_pattern'
  if (/presented by|sponsor/.test(text)) return 'sponsor_board'
  if (boardCount > 1) return 'multi_board_package'
  return 'matchup'
}

export function extractMatchup(text: string): { home: string | null; away: string | null } {
  const cleaned = compact(text, 500)
  const patterns = [
    /([A-Z][A-Za-z0-9.'&\- ]{2,40})\s+vs\.?\s+([A-Z][A-Za-z0-9.'&\- ]{2,40})/,
    /([A-Z][A-Za-z0-9.'&\- ]{2,40})\s+v\.?\s+([A-Z][A-Za-z0-9.'&\- ]{2,40})/,
    /([A-Z][A-Za-z0-9.'&\- ]{2,40})\s+at\s+([A-Z][A-Za-z0-9.'&\- ]{2,40})/,
  ]
  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) {
      const left = titleCase(match[1].trim())
      const right = titleCase(match[2].trim())
      if (/\sat\s/i.test(match[0])) return { home: right, away: left }
      return { home: left, away: right }
    }
  }
  return { home: null, away: null }
}

export function extractScoreOrCountdown(text: string): string | null {
  const cleaned = compact(text, 500)
  const countdown = cleaned.match(/\b(\d{1,2}:\d{2})\b/)
  if (countdown) return countdown[1]
  const score = cleaned.match(/\b(\d{1,3}\s*[-:]\s*\d{1,3})\b/)
  if (score) return score[1].replace(/\s+/g, '')
  return null
}

export function extractSponsor(text: string): string | null {
  const cleaned = compact(text, 500)
  const patterns = [
    /presented by\s+([A-Z][A-Za-z0-9.'&\- ]{2,40})/i,
    /sponsor(?:ed| integration| board)?(?: by)?\s+([A-Z][A-Za-z0-9.'&\- ]{2,40})/i,
  ]
  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) return titleCase(match[1].trim())
  }
  return null
}

// ── Board Parsing & Geometry ───────────────────────────────────────

export function parseSizes(raw: string | null | undefined): Array<{ width: number; height: number }> {
  const matches = (raw || '').match(/\d{2,5}\s*[x×]\s*\d{2,5}/gi) || []
  return matches.map((token) => {
    const [w, h] = token.toLowerCase().split(/[x×]/).map(part => Number(part.trim()))
    return { width: w, height: h }
  }).filter(item => Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0)
}

export function inferBoardType(name: string, ratio: number): BoardType {
  const lower = name.toLowerCase()
  if (/ribbon|fascia|dasher|strip|loop/.test(lower) || ratio >= 4) return 'fascia'
  if (/side|pillar|vom|tunnel/.test(lower)) return 'side_panel'
  if (/corner/.test(lower)) return 'corner_board'
  if (/stat/.test(lower)) return 'stat_area'
  if (/main|scoreboard|center|court|video|led/.test(lower)) return 'main_board'
  if (ratio <= 0.75) return 'side_panel'
  return 'custom_zone'
}

function parseGlobalSafeZone(text: string, boardType: BoardType, ratio: number): SafeZone | null {
  const match = text.match(/\bsafe(?:[\s-]+area|[\s-]+zone| margin)?\s*(?:of|:)?\s*(\d{1,2})\s*%/i)
  if (!match) return null
  const inset = clampPercent(Number(match[1]), boardType === 'fascia' ? 18 : 8)
  if (boardType === 'fascia') {
    return {
      top_pct: Math.max(inset, 16),
      right_pct: 4,
      bottom_pct: Math.max(inset, 16),
      left_pct: 4,
      note: `Safe zone parsed from brief (${inset}% vertical inset) and normalized for long-run fascia playback.`,
    }
  }
  const sideInset = ratio <= 0.8 ? Math.max(inset, 8) : inset
  return {
    top_pct: inset,
    right_pct: sideInset,
    bottom_pct: inset,
    left_pct: sideInset,
    note: `Safe zone parsed from brief (${inset}% inset).`,
  }
}

function conservativeSafeZone(boardType: BoardType, ratio: number): SafeZone {
  const defaults = BOARD_RULES[boardType].safe_zone_defaults
  if (boardType === 'fascia') return { ...defaults }
  if (boardType === 'side_panel' || ratio <= 0.8) return { ...defaults }
  return { ...defaults }
}

export function resolveSafeZone(boardType: BoardType, ratio: number, notes: string): SafeZone {
  return parseGlobalSafeZone(notes, boardType, ratio) || conservativeSafeZone(boardType, ratio)
}

function parseExplicitBands(text: string, keyword: RegExp, fallbackNote: string): ZoneBand[] {
  const bands: ZoneBand[] = []
  const rangePattern = new RegExp(`${keyword.source}[^\\d]{0,20}(\\d{1,3})\\s*(?:-|to)\\s*(\\d{1,3})\\s*%`, 'gi')
  const pointPattern = new RegExp(`${keyword.source}[^\\d]{0,20}(\\d{1,3})\\s*%`, 'gi')

  let match: RegExpExecArray | null
  while ((match = rangePattern.exec(text))) {
    const start = clampBandPercent(Number(match[1]), 48)
    const end = clampBandPercent(Number(match[2]), 52)
    bands.push({ start_pct: Math.min(start, end), end_pct: Math.max(start, end), note: fallbackNote })
  }

  while ((match = pointPattern.exec(text))) {
    const center = clampBandPercent(Number(match[1]), 50)
    const start = Math.max(0, center - 2)
    const end = Math.min(100, center + 2)
    if (!bands.some(band => Math.abs(band.start_pct - start) <= 1 && Math.abs(band.end_pct - end) <= 1)) {
      bands.push({ start_pct: start, end_pct: end, note: fallbackNote })
    }
  }

  return bands
}

function conservativeBendZones(boardType: BoardType, ratio: number, notes: string): ZoneBand[] {
  const lowerNotes = notes.toLowerCase()
  if (/bend|curve|break|seam/.test(lowerNotes) || boardType === 'fascia' || ratio >= 4) {
    return [{ start_pct: 48, end_pct: 52, note: 'Assume center bend / camera seam. Keep critical content out of this zone.' }]
  }
  return []
}

export function resolveBendZones(boardType: BoardType, ratio: number, notes: string): ZoneBand[] {
  const explicit = parseExplicitBands(notes, /bend|curve|seam/i, 'Bend/seam parsed from brief.')
  return explicit.length > 0 ? explicit : conservativeBendZones(boardType, ratio, notes)
}

function conservativeCameraBreaks(boardType: BoardType, notes: string): ZoneBand[] {
  const lowerNotes = notes.toLowerCase()
  if (/camera break|camera cut|hard break/.test(lowerNotes)) {
    return [{ start_pct: 49, end_pct: 51, note: 'Assumed broadcast camera break from brief.' }]
  }
  if (boardType === 'main_board' && /scoreboard|center-hung/.test(lowerNotes)) {
    return [{ start_pct: 49, end_pct: 51, note: 'Conservative center split for multi-face scoreboard proofing.' }]
  }
  return []
}

export function resolveCameraBreaks(boardType: BoardType, notes: string): ZoneBand[] {
  const explicit = parseExplicitBands(notes, /camera break|camera cut|hard break/i, 'Camera break parsed from brief.')
  return explicit.length > 0 ? explicit : conservativeCameraBreaks(boardType, notes)
}

// ── Content Strategy Builder ──────────────────────────────────────

export function buildContentStrategy(requestType: RequestType, boardType: BoardType): ContentStrategy {
  const rule = REQUEST_RULES[requestType]
  const boardRule = BOARD_RULES[boardType]

  const byBoardType: Partial<Record<BoardType, Partial<ContentStrategy>>> = {
    fascia: {
      primary_focus: requestType === 'final_score' ? 'FINAL + score fragments only if huge and separated by seams' : rule.primary,
      secondary_focus: 'Repeat logos, sponsor beats, short phrases, striping, or pattern rhythm',
      layout_pattern: 'Long-run repeated modules with oversized single message or alternating logo/message beats',
      repetition_mode: 'repeat',
      max_message_units: 1,
      anchor_preference: 'Anchor modules to seam-safe thirds and keep the center run expendable.',
      avoid_regions: ['center bend', 'top/bottom trim', 'any seam used for repeated module breaks'],
    },
    side_panel: {
      primary_focus: rule.primary,
      secondary_focus: 'Stacked logo / label / sponsor system',
      layout_pattern: 'Vertical stack with one dominant number or phrase',
      anchor_preference: 'Center-weighted vertical stack with protected logo or sponsor footer.',
      avoid_regions: ['outer trim', 'center vertical axis if split hardware'],
    },
    corner_board: {
      primary_focus: rule.primary,
      secondary_focus: 'Stacked logo / label / sponsor system',
      layout_pattern: 'Vertical stack with one dominant number or phrase',
      anchor_preference: 'Center-weighted vertical stack with protected logo or sponsor footer.',
      avoid_regions: ['outer trim', 'center vertical axis if split hardware'],
    },
    stat_area: {
      primary_focus: requestType === 'final_score' ? 'Score / final indicator / team abbreviations' : 'Single stat or timer',
      secondary_focus: 'Tiny support labels only if they remain readable',
      layout_pattern: 'Data-first grid with strong numeric lockup',
      anchor_preference: 'Build around a large central numeric field with compact labels.',
      avoid_regions: ['corners needed for score bugs or data widgets'],
    },
  }

  const override = byBoardType[boardType]

  return {
    primary_focus: override?.primary_focus ?? rule.primary,
    secondary_focus: override?.secondary_focus ?? rule.secondary,
    layout_pattern: override?.layout_pattern ?? 'Centered modular composition built for distance readability',
    repetition_mode: override?.repetition_mode ?? boardRule.repetition_mode,
    max_message_units: override?.max_message_units ?? boardRule.max_message_units,
    anchor_preference: override?.anchor_preference ?? 'Use a single dominant center lockup with restrained edge support.',
    allowed_elements: boardRule.allowed_elements,
    forbidden_elements: boardRule.forbidden_elements,
    avoid_regions: override?.avoid_regions ?? ['center seam', 'outer safe margin'],
  }
}

// ── Board Builder ──────────────────────────────────────────────────

function inferBoardName(index: number, boardType: BoardType): string {
  const labels: Record<BoardType, string> = {
    main_board: 'Main Board',
    fascia: 'Ribbon / Fascia',
    side_panel: 'Side Panel',
    stat_area: 'Stat Area',
    corner_board: 'Corner Board',
    custom_zone: 'Custom Zone',
  }
  return `${labels[boardType]} ${index + 1}`
}

export function buildBoards(ctx: DesignContext): { boards: BoardPlan[]; assumptions: string[] } {
  const boardNames = splitLooseList(ctx.boards)
  const sizes = parseSizes(ctx.sizes)
  const total = Math.max(boardNames.length, sizes.length, 1)
  const assumptions: string[] = []

  if (boardNames.length === 0) assumptions.push('No board labels were provided, so generic production labels were assigned from geometry.')
  if (sizes.length === 0) assumptions.push('No explicit board sizes were provided, so a conservative 1920x1080 default was used for planning.')
  if (boardNames.length > 0 && sizes.length > 0 && boardNames.length !== sizes.length) {
    assumptions.push('Board labels and size counts did not match, so boards were paired by order and remaining boards reused the nearest available size.')
  }

  const boards: BoardPlan[] = []
  for (let i = 0; i < total; i++) {
    const size = sizes[i] || sizes[0] || { width: 1920, height: 1080 }
    const ratio = Number((size.width / size.height).toFixed(3))
    const guessedType = inferBoardType(boardNames[i] || '', ratio)
    const name = boardNames[i] || inferBoardName(i, guessedType)
    const boardType = inferBoardType(name, ratio)
    const notes = `${ctx.notes || ''} ${ctx.boards || ''} ${ctx.sizes || ''}`
    const safeZone = resolveSafeZone(boardType, ratio, notes)
    const bendZones = resolveBendZones(boardType, ratio, notes)
    const cameraBreaks = resolveCameraBreaks(boardType, notes)
    const constraintSummary = [
      `${boardType} planned at ${size.width}x${size.height} (${ratio}:1).`,
      `Safe area inset: L${safeZone.left_pct}% / R${safeZone.right_pct}% / T${safeZone.top_pct}% / B${safeZone.bottom_pct}%.`,
      bendZones.length > 0 ? `Bend zones: ${bendZones.map(zone => `${zone.start_pct}-${zone.end_pct}%`).join(', ')}.` : 'No explicit bend zone provided; keep center-weighted content conservative.',
      cameraBreaks.length > 0 ? `Camera breaks: ${cameraBreaks.map(zone => `${zone.start_pct}-${zone.end_pct}%`).join(', ')}.` : 'No camera break provided.',
    ]
    boards.push({
      board_name: name,
      width: size.width,
      height: size.height,
      aspect_ratio: ratio,
      board_type: boardType,
      safe_zones: safeZone,
      bend_zones: bendZones,
      camera_breaks: cameraBreaks,
      constraints_summary: constraintSummary,
      content_strategy: buildContentStrategy('multi_board_package', boardType),
    })
  }

  return { boards, assumptions }
}

// ── Creative Brief ─────────────────────────────────────────────────

export function buildCreativeBrief(ctx: DesignContext, requestType: RequestType, boards: BoardPlan[]): CreativeBrief {
  const allText = `${ctx.title} ${ctx.notes || ''} ${ctx.client || ''}`
  const matchup = extractMatchup(allText)
  const scoreOrCountdown = extractScoreOrCountdown(allText)
  const sponsor = extractSponsor(allText)
  const rule = REQUEST_RULES[requestType]

  const eventLabel =
    requestType === 'final_score' ? 'FINAL' :
    requestType === 'countdown' ? 'COUNTDOWN' :
    /home opener/i.test(allText) ? 'HOME OPENER' :
    /playoff/i.test(allText) ? 'PLAYOFF GAME NIGHT' :
    'GAME NIGHT'

  const teamLine = matchup.home && matchup.away
    ? `${matchup.away} vs ${matchup.home}`
    : compact(ctx.client) || compact(ctx.title) || 'Venue event package'

  const primaryMessage =
    requestType === 'final_score' && scoreOrCountdown ? `${eventLabel} ${scoreOrCountdown}` :
    requestType === 'countdown' && scoreOrCountdown ? `${scoreOrCountdown} TO ${compact(inferSport(allText) || 'START').toUpperCase()}` :
    requestType === 'logo_loop' ? `${compact(ctx.client) || 'HOME TEAM'} LOGO LOOP` :
    requestType === 'fascia_pattern' ? `${compact(ctx.client) || 'HOME TEAM'} PATTERN SYSTEM` :
    eventLabel

  const secondaryMessage =
    requestType === 'final_score' ? teamLine :
    requestType === 'countdown' ? teamLine :
    sponsor ? `Presented by ${sponsor}` :
    teamLine

  return {
    primary_message: primaryMessage,
    secondary_message: secondaryMessage,
    numeric_priority: rule.numeric_priority,
    logo_priority: rule.logo_priority,
    sponsor_placement: sponsor ? 'Sponsor lockup anchored in a protected lower corner or repeated as a restrained fascia beat.' : 'No sponsor required unless a board specifically calls for it.',
    screen_specific_adaptation_strategy: boards.map((board) => {
      if (board.board_type === 'fascia') return `${board.board_name}: use repeating modules, short phrases, logos, or pattern rhythm; no dense copy.`
      if (board.board_type === 'side_panel') return `${board.board_name}: use a stacked logo/message lockup with one dominant word, score, or timer.`
      if (board.board_type === 'stat_area') return `${board.board_name}: prioritize numbers and labels over decorative art.`
      return `${board.board_name}: carry the same visual system with one dominant message and protected sponsor/logo support.`
    }),
  }
}

// ── Proof Preview Builder ─────────────────────────────────────────

export function buildProofPreview(board: BoardPlan, requestType: RequestType, brief: CreativeBrief): string {
  if (board.board_type === 'fascia') {
    return `${brief.primary_message} treated as repeating ribbon beats with logos/patterns; no critical copy in bend zone; sponsor beat only if it stays secondary.`
  }
  if (board.board_type === 'side_panel' || board.board_type === 'corner_board') {
    return `Stacked system with ${brief.primary_message} dominant, ${brief.secondary_message} secondary, and logo/sponsor locked into the safe corner.`
  }
  if (requestType === 'final_score') {
    return `Top: FINAL. Center: oversized score. Side anchors: team names / logos. Bottom-safe zone: restrained sponsor or venue line.`
  }
  if (requestType === 'countdown') {
    return `Center: huge countdown number. Upper label: event cue. Lower support: matchup / sponsor in secondary scale.`
  }
  return `Single-message arena board using ${brief.primary_message} as the headline, ${brief.secondary_message} as support, and the same dark-textured system carried across zones.`
}

// ── Normalized Request ─────────────────────────────────────────────

export function buildNormalizedRequest(ctx: DesignContext, requestType: RequestType, boards: BoardPlan[], assumptions: string[]): NormalizedRequest {
  const allText = compact(`${ctx.title} ${ctx.notes || ''} ${ctx.boards || ''} ${ctx.sizes || ''}`, 700)
  const rule = REQUEST_RULES[requestType]
  const explicitConstraints = [
    ctx.boards ? `Requested boards: ${compact(ctx.boards, 220)}` : '',
    ctx.sizes ? `Board sizes: ${compact(ctx.sizes, 220)}` : '',
    /bend|curve|seam|camera break|safe area|safe zone/i.test(allText) ? `Production constraints in brief: ${compact(allText, 260)}` : '',
  ].filter(Boolean)

  return {
    summary: allText || 'Arena signage package request',
    primary_intent: rule.description,
    message_mode: rule.message_mode,
    explicit_constraints: explicitConstraints,
    assumptions: [
      ...assumptions,
      ...boards.flatMap(board => [
        board.bend_zones.length === 0 && board.board_type === 'fascia'
          ? `${board.board_name}: no bend was supplied, so a center-safe fascia assumption remains in effect.`
          : '',
        board.camera_breaks.length === 0 && board.board_type === 'main_board'
          ? `${board.board_name}: no camera break was supplied, so center-weighted composition stays conservative.`
          : '',
      ]).filter(Boolean),
    ],
    hero_image_allowed: /hero image|player render|photo composite|photography/i.test(allText),
  }
}

// ── Concept System Selector ─────────────────────────────────────────

export function selectConceptSystem(sport: string | null, eventType: string | null): ConceptSystem {
  const preset = CONCEPT_PRESETS[sport || ''] ?? CONCEPT_PRESETS.default
  const energyOverride = eventType ? EVENT_ENERGY_OVERRIDES[eventType] : null
  return {
    art_direction: energyOverride?.art_direction ?? preset.art_direction,
    palette: energyOverride?.palette ?? preset.palette,
    typography: preset.typography,
    texture: preset.texture,
    hierarchy: preset.hierarchy,
  }
}

// ── Master Plan Builder ────────────────────────────────────────────

export function buildPlan(ctx: DesignContext): PackagePlan {
  const { boards, assumptions } = buildBoards(ctx)
  const requestType = classifyRequest(ctx, boards.length)
  const allText = `${ctx.title} ${ctx.notes || ''} ${ctx.client || ''} ${ctx.boards || ''}`
  const sport = inferSport(allText)
  const eventType = inferEventType(allText)
  const conceptSystem = selectConceptSystem(sport, eventType)
  const brief = buildCreativeBrief(ctx, requestType, boards)

  const updatedBoards = boards.map((board) => ({
    ...board,
    content_strategy: buildContentStrategy(requestType, board.board_type),
  }))

  const proofs: ProofPlan[] = updatedBoards.map((board) => ({
    board_label: board.board_name,
    dimensions: `${board.width}x${board.height}`,
    bend_marker: board.bend_zones.length > 0
      ? board.bend_zones.map(zone => `${zone.start_pct}-${zone.end_pct}% (${zone.note})`).join('; ')
      : 'No explicit bend marker; use conservative center-safe composition.',
    safe_content_area: `${100 - board.safe_zones.left_pct - board.safe_zones.right_pct}% x ${100 - board.safe_zones.top_pct - board.safe_zones.bottom_pct}% usable area. ${board.safe_zones.note}`,
    simplified_proof_preview: buildProofPreview(board, requestType, brief),
    content_modules: [
      board.content_strategy.primary_focus,
      board.content_strategy.secondary_focus,
      `Anchor: ${board.content_strategy.anchor_preference}`,
    ],
    production_notes: [
      ...board.constraints_summary,
      `Avoid: ${board.content_strategy.avoid_regions.join(', ')}.`,
      `Do not exceed ${board.content_strategy.max_message_units} critical message unit per board.`,
    ],
    export_metadata: {
      filename_stub: compact(board.board_name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board-proof',
      aspect_ratio: `${board.aspect_ratio}:1`,
      board_type: board.board_type,
      usable_width_px: Math.max(1, Math.round(board.width * (100 - board.safe_zones.left_pct - board.safe_zones.right_pct) / 100)),
      usable_height_px: Math.max(1, Math.round(board.height * (100 - board.safe_zones.top_pct - board.safe_zones.bottom_pct) / 100)),
    },
  }))

  return {
    planning_version: 'v3',
    generation_mode: 'venue_signage_package',
    request_type: requestType,
    sport,
    event_type: eventType,
    home_team: extractMatchup(allText).home,
    away_team: extractMatchup(allText).away,
    score_or_countdown: extractScoreOrCountdown(allText),
    sponsor: extractSponsor(allText),
    venue_name: ctx.venue,
    normalized_request: buildNormalizedRequest(ctx, requestType, updatedBoards, assumptions),
    concept_system: conceptSystem,
    creative_brief: brief,
    proof_sheet: {
      layout_style: 'Flat multi-panel production proof sheet with orthographic board crops; no 3D mockups.',
      annotation_style: 'Board label, dimensions, safe-area guides, bend markers, and concise adaptation notes.',
      include_dimensions: true,
      include_safe_areas: true,
      include_bend_markers: true,
    },
    boards: updatedBoards,
    proofs,
    safeguards: [...SIGNAGE_SAFEGUARDS],
  }
}

// ── Image Prompt Builder ───────────────────────────────────────────
// This is the critical anti-slop layer. The prompt is constructed
// deterministically from the plan to constrain the image model
// into producing venue signage, not social media posters.

export function buildImagePrompt(ctx: DesignContext, plan: PackagePlan): string {
  const boardLines = plan.boards.map((board, index) =>
    `${index + 1}. ${board.board_name} — ${board.width}x${board.height} (${board.board_type}), safe zone L${board.safe_zones.left_pct}/R${board.safe_zones.right_pct}/T${board.safe_zones.top_pct}/B${board.safe_zones.bottom_pct}, bends: ${board.bend_zones.length > 0 ? board.bend_zones.map(z => `${z.start_pct}-${z.end_pct}%`).join(', ') : 'none'}, camera breaks: ${board.camera_breaks.length > 0 ? board.camera_breaks.map(z => `${z.start_pct}-${z.end_pct}%`).join(', ') : 'none'}, strategy: ${board.content_strategy.layout_pattern}; anchor: ${board.content_strategy.anchor_preference}; primary: ${board.content_strategy.primary_focus}; secondary: ${board.content_strategy.secondary_focus}; allowed: ${board.content_strategy.allowed_elements.join(', ')}; forbidden: ${board.content_strategy.forbidden_elements.join(', ')}.`
  ).join(' ')

  const negatives = [
    'Do NOT make a generic sports poster, social graphic, player collage, cinematic key art, or hype wallpaper.',
    'Do NOT use photoreal stadium photography, dramatic lens flares, floating athletes, mascots, crowds, or marketing-poster composition.',
    'Do NOT put dense paragraphs, tiny sponsor logos, or critical copy across bends, seams, or camera breaks.',
    'Do NOT invent a separate visual concept for each board; adapt one modular system across all boards.',
    'Do NOT render 3D mockups, LED boards in perspective, handheld devices, or social-media frames.',
    'Do NOT create a team-colored hype poster. This is operational venue LED signage, not fan art.',
  ].join(' ')

  const venue = compact(ctx.venue) || 'arena venue'
  const title = compact(ctx.title) || 'game-night package'
  const notes = compact(ctx.notes, 600)
  const assumptions = plan.normalized_request.assumptions.slice(0, 5).join(' ')
  const heroRule = plan.normalized_request.hero_image_allowed
    ? 'Hero imagery is allowed only if it still reads like operational venue signage.'
    : 'Do not include hero players or poster-style character art.'

  return [
    'Create a production-minded arena signage proof sheet, not a poster.',
    'Think like a production designer preparing venue LED starting points for an operator, not like a social-media art director.',
    `Show a labeled multi-panel proof board for ${title} at ${venue}.`,
    `Request type: ${plan.request_type}. Sport: ${plan.sport || 'sports venue'}. Event type: ${plan.event_type || 'game night'}.`,
    `Primary intent: ${plan.normalized_request.primary_intent}. Message mode: ${plan.normalized_request.message_mode}.`,
    `Primary message: ${plan.creative_brief.primary_message}. Secondary message: ${plan.creative_brief.secondary_message}. Sponsor: ${plan.sponsor || 'none'}.`,
    `Visual system: ${plan.concept_system.art_direction} Palette: ${plan.concept_system.palette.join(', ')}. Typography: ${plan.concept_system.typography}.`,
    `Board adaptations: ${boardLines}`,
    `Proof-sheet format: ${plan.proof_sheet.layout_style} ${plan.proof_sheet.annotation_style}`,
    'Each panel should resemble a believable in-venue LED layout that a designer could refine and ship. Flat, front-on, operational, geometry-aware, production-safe.',
    'One message per screen. Large condensed typography. Strong contrast. Modular geometry-aware composition. Repeating motifs on long ribbons. Never place critical copy across a bend, seam, or camera break.',
    heroRule,
    assumptions ? `Assumptions: ${assumptions}` : '',
    notes ? `Brief notes: ${notes}.` : '',
    negatives,
  ].filter(Boolean).join(' ')
}

// ── Validation / Guard Layer ───────────────────────────────────────
// Programmatic checks that run BEFORE image generation to catch
// common failure modes the prompt alone can't prevent.

export interface ValidationResult {
  valid: boolean
  warnings: string[]
  blocks: string[]
}

export function validatePlan(plan: PackagePlan): ValidationResult {
  const warnings: string[] = []
  const blocks: string[] = []

  if (plan.boards.length === 0) {
    blocks.push('No boards were parsed from the request. At least one board is required.')
  }

  for (const board of plan.boards) {
    if (board.width < 64 || board.height < 16) {
      blocks.push(`${board.board_name}: dimensions ${board.width}x${board.height} are too small for production signage.`)
    }

    if (board.board_type === 'fascia' && board.content_strategy.max_message_units > 1) {
      blocks.push(`${board.board_name}: fascia boards must have max_message_units of 1, got ${board.content_strategy.max_message_units}.`)
    }

    if (board.board_type === 'fascia' && board.aspect_ratio < 4 && !board.content_strategy.allowed_elements.includes('repeating logos')) {
      warnings.push(`${board.board_name}: aspect ratio ${board.aspect_ratio}:1 is wider than typical fascia but classified as fascia. Verify board type.`)
    }

    const usableWidth = 100 - board.safe_zones.left_pct - board.safe_zones.right_pct
    const usableHeight = 100 - board.safe_zones.top_pct - board.safe_zones.bottom_pct
    if (usableWidth < 40) {
      warnings.push(`${board.board_name}: only ${usableWidth}% horizontal usable area. Very tight for content.`)
    }
    if (usableHeight < 40) {
      warnings.push(`${board.board_name}: only ${usableHeight}% vertical usable area. Very tight for content.`)
    }

    for (const zone of board.bend_zones) {
      const zoneWidth = zone.end_pct - zone.start_pct
      if (zoneWidth > 30) {
        warnings.push(`${board.board_name}: bend zone ${zone.start_pct}-${zone.end_pct}% is very wide (${zoneWidth}%). May constrain layout.`)
      }
    }
  }

  if (plan.request_type === 'final_score' && !plan.score_or_countdown) {
    warnings.push('Request classified as final_score but no score was extracted from the brief.')
  }

  if (plan.request_type === 'countdown' && !plan.score_or_countdown) {
    warnings.push('Request classified as countdown but no countdown value was extracted from the brief.')
  }

  if (plan.request_type === 'sponsor_board' && !plan.sponsor) {
    warnings.push('Request classified as sponsor_board but no sponsor was extracted from the brief.')
  }

  for (const board of plan.boards) {
    if (board.content_strategy.forbidden_elements.some(el => /photo|image|hero|player/i.test(el)) && /photo|hero|player/i.test(plan.concept_system.art_direction)) {
      warnings.push(`${board.board_name}: art direction mentions hero/photo elements but board type forbids them. Art direction will be constrained.`)
    }
  }

  return {
    valid: blocks.length === 0,
    warnings,
    blocks,
  }
}