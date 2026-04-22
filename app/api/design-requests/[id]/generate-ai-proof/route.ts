import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, isConfigured } from '@/lib/proof-storage'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

type RequestType =
  | 'final_score'
  | 'countdown'
  | 'matchup'
  | 'sponsor_board'
  | 'logo_loop'
  | 'fascia_pattern'
  | 'multi_board_package'

type BoardType =
  | 'main_board'
  | 'fascia'
  | 'side_panel'
  | 'stat_area'
  | 'corner_board'
  | 'custom_zone'

interface DesignContext {
  title: string
  client: string | null
  tricode: string | null
  venue: string | null
  boards: string | null
  sizes: string | null
  notes: string | null
}

interface ZoneBand {
  start_pct: number
  end_pct: number
  note: string
}

interface SafeZone {
  top_pct: number
  right_pct: number
  bottom_pct: number
  left_pct: number
  note: string
}

interface BoardPlan {
  board_name: string
  width: number
  height: number
  aspect_ratio: number
  board_type: BoardType
  safe_zones: SafeZone
  bend_zones: ZoneBand[]
  camera_breaks: ZoneBand[]
  content_strategy: {
    primary_focus: string
    secondary_focus: string
    layout_pattern: string
    repetition_mode: string
    avoid_regions: string[]
  }
}

interface CreativeBrief {
  primary_message: string
  secondary_message: string
  numeric_priority: 'high' | 'medium' | 'low'
  logo_priority: 'high' | 'medium' | 'low'
  sponsor_placement: string
  screen_specific_adaptation_strategy: string[]
}

interface ProofPlan {
  board_label: string
  dimensions: string
  bend_marker: string
  safe_content_area: string
  simplified_proof_preview: string
  export_metadata: {
    filename_stub: string
    aspect_ratio: string
    board_type: BoardType
  }
}

interface PackagePlan {
  generation_mode: 'venue_signage_package'
  request_type: RequestType
  sport: string | null
  event_type: string | null
  home_team: string | null
  away_team: string | null
  score_or_countdown: string | null
  sponsor: string | null
  venue_name: string | null
  concept_system: {
    art_direction: string
    palette: string[]
    typography: string
    texture: string
    hierarchy: string
  }
  creative_brief: CreativeBrief
  boards: BoardPlan[]
  proofs: ProofPlan[]
  safeguards: string[]
}

const OPENAI_KEY = process.env.OPENAI_API_KEY || (() => {
  try {
    const list = JSON.parse(process.env.AI_PROVIDERS_JSON || '[]')
    const openai = Array.isArray(list) ? list.find((p: any) => p?.name === 'openai' && p?.apiKey) : null
    return openai?.apiKey || ''
  } catch {
    return ''
  }
})()

const AI_MODEL = 'gpt-image-1.5'
const AI_SIZE = '1024x1024'
const AI_QUALITY = 'low'

async function loadDesignContext(id: string): Promise<DesignContext> {
  const ctx: DesignContext = {
    title: 'Design Request',
    client: null,
    tricode: null,
    venue: null,
    boards: null,
    sizes: null,
    notes: null,
  }

  if (isTwentyBackedEnabled('DESIGNS')) {
    const d = await Designs.get(id) as any
    if (d) {
      ctx.title = d.name || ctx.title
      ctx.client = d.designClient?.name || null
      ctx.tricode = d.clientTriCode || null
      ctx.boards = d.boardSection || null
      ctx.sizes = d.sizes || null
      ctx.notes = typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || '')
    }
  }

  const r = await query(
    `SELECT dr.job_title, dr.company_name, dr.tricode, dr.boards_requested, dr.sizes_requested,
            dr.notes, v.name as venue_name
     FROM design_requests dr LEFT JOIN venues v ON v.id = dr.venue_id
     WHERE dr.id = $1`,
    [id]
  )

  if (r.rows[0]) {
    const row = r.rows[0]
    ctx.title = ctx.title === 'Design Request' ? (row.job_title || ctx.title) : ctx.title
    ctx.client = ctx.client || row.company_name || null
    ctx.tricode = ctx.tricode || row.tricode || null
    ctx.venue = row.venue_name || null
    ctx.boards = ctx.boards || row.boards_requested || null
    ctx.sizes = ctx.sizes || row.sizes_requested || null
    ctx.notes = ctx.notes || row.notes || null
  }

  return ctx
}

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

function inferSport(text: string): string | null {
  const lower = text.toLowerCase()
  if (/hockey|puck|rink|nhl|ice/.test(lower)) return 'hockey'
  if (/basketball|hoops|nba|court/.test(lower)) return 'basketball'
  if (/football|kickoff|touchdown|nfl/.test(lower)) return 'football'
  if (/baseball|mlb|first pitch/.test(lower)) return 'baseball'
  if (/soccer|futbol|goal kick|mls/.test(lower)) return 'soccer'
  if (/lacrosse/.test(lower)) return 'lacrosse'
  return null
}

function inferEventType(text: string): string | null {
  const lower = text.toLowerCase()
  if (/home opener/.test(lower)) return 'home opener'
  if (/playoff/.test(lower)) return 'playoff game'
  if (/game night/.test(lower)) return 'game night'
  if (/final score|final/.test(lower)) return 'final score'
  if (/countdown|puck drop|tip-off|kickoff/.test(lower)) return 'countdown'
  return null
}

function extractMatchup(text: string): { home: string | null; away: string | null } {
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

function extractScoreOrCountdown(text: string): string | null {
  const cleaned = compact(text, 500)
  const countdown = cleaned.match(/\b(\d{1,2}:\d{2})\b/)
  if (countdown) return countdown[1]
  const score = cleaned.match(/\b(\d{1,3}\s*[-:]\s*\d{1,3})\b/)
  if (score) return score[1].replace(/\s+/g, '')
  return null
}

function extractSponsor(text: string): string | null {
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

function classifyRequest(ctx: DesignContext, boardCount: number): RequestType {
  const text = `${ctx.title} ${ctx.notes || ''} ${ctx.boards || ''}`.toLowerCase()
  if (/final score|\bfinal\b/.test(text) || /\b\d{1,3}\s*[-:]\s*\d{1,3}\b/.test(text)) return 'final_score'
  if (/countdown|puck drop|tip-?off|kickoff/.test(text) || /\b\d{1,2}:\d{2}\b/.test(text)) return 'countdown'
  if (/logo loop|repeating logo|logo strip/.test(text)) return 'logo_loop'
  if (/fascia pattern|pattern-based fascia|pattern only/.test(text)) return 'fascia_pattern'
  if (/presented by|sponsor/.test(text)) return 'sponsor_board'
  if (boardCount > 1) return 'multi_board_package'
  return 'matchup'
}

function parseSizes(raw: string | null | undefined): Array<{ width: number; height: number }> {
  const matches = (raw || '').match(/\d{2,5}\s*[x×]\s*\d{2,5}/gi) || []
  return matches.map((token) => {
    const [w, h] = token.toLowerCase().split(/[x×]/).map(part => Number(part.trim()))
    return { width: w, height: h }
  }).filter(item => Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0)
}

function inferBoardType(name: string, ratio: number): BoardType {
  const lower = name.toLowerCase()
  if (/ribbon|fascia|dasher|strip|loop/.test(lower) || ratio >= 4) return 'fascia'
  if (/side|pillar|vom|tunnel/.test(lower)) return 'side_panel'
  if (/corner/.test(lower)) return 'corner_board'
  if (/stat/.test(lower)) return 'stat_area'
  if (/main|scoreboard|center|court|video|led/.test(lower)) return 'main_board'
  if (ratio <= 0.75) return 'side_panel'
  return 'custom_zone'
}

function conservativeSafeZone(boardType: BoardType, ratio: number): SafeZone {
  if (boardType === 'fascia') {
    return { top_pct: 18, right_pct: 4, bottom_pct: 18, left_pct: 4, note: 'Protect top/bottom edges and keep critical copy out of long-run seams.' }
  }
  if (boardType === 'side_panel' || ratio <= 0.8) {
    return { top_pct: 8, right_pct: 8, bottom_pct: 8, left_pct: 8, note: 'Keep stacked message system centered and vertically balanced.' }
  }
  return { top_pct: 6, right_pct: 6, bottom_pct: 8, left_pct: 6, note: 'Standard production-safe margin for arena LED proofs.' }
}

function conservativeBendZones(boardType: BoardType, ratio: number, notes: string): ZoneBand[] {
  const lowerNotes = notes.toLowerCase()
  if (/bend|curve|break|seam/.test(lowerNotes) || boardType === 'fascia' || ratio >= 4) {
    return [{ start_pct: 48, end_pct: 52, note: 'Assume center bend / camera seam. Keep critical content out of this zone.' }]
  }
  return []
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

function boardRule(requestType: RequestType, boardType: BoardType): BoardPlan['content_strategy'] {
  const byRequest: Record<RequestType, { primary: string; secondary: string }> = {
    final_score: { primary: 'Final score / teams / FINAL label', secondary: 'Sponsor lockup or venue line' },
    countdown: { primary: 'Timer / countdown value', secondary: 'Event label / opponent / date' },
    matchup: { primary: 'Game-night matchup message', secondary: 'Venue / date / accent logos' },
    sponsor_board: { primary: 'Event message with sponsor lockup', secondary: 'Sponsor presented-by treatment' },
    logo_loop: { primary: 'Repeated logo rhythm', secondary: 'Short phrase if space allows' },
    fascia_pattern: { primary: 'Pattern / logo strip', secondary: 'One oversized short phrase max' },
    multi_board_package: { primary: 'Single clear event message', secondary: 'Adaptive sponsor / logo system' },
  }

  const base = byRequest[requestType]

  if (boardType === 'fascia') {
    return {
      primary_focus: requestType === 'final_score' ? 'FINAL + score fragments only if huge and separated by seams' : base.primary,
      secondary_focus: 'Repeat logos, sponsor beats, short phrases, striping, or pattern rhythm',
      layout_pattern: 'Long-run repeated modules with oversized single message or alternating logo/message beats',
      repetition_mode: 'repeat',
      avoid_regions: ['center bend', 'top/bottom trim', 'any seam used for repeated module breaks'],
    }
  }

  if (boardType === 'side_panel' || boardType === 'corner_board') {
    return {
      primary_focus: base.primary,
      secondary_focus: 'Stacked logo / label / sponsor system',
      layout_pattern: 'Vertical stack with one dominant number or phrase',
      repetition_mode: 'none',
      avoid_regions: ['outer trim', 'center vertical axis if split hardware'],
    }
  }

  if (boardType === 'stat_area') {
    return {
      primary_focus: requestType === 'final_score' ? 'Score / final indicator / team abbreviations' : 'Single stat or timer',
      secondary_focus: 'Tiny support labels only if they remain readable',
      layout_pattern: 'Data-first grid with strong numeric lockup',
      repetition_mode: 'none',
      avoid_regions: ['corners needed for score bugs or data widgets'],
    }
  }

  return {
    primary_focus: base.primary,
    secondary_focus: base.secondary,
    layout_pattern: 'Centered modular composition built for distance readability',
    repetition_mode: 'none',
    avoid_regions: ['center seam', 'outer safe margin'],
  }
}

function buildBoards(ctx: DesignContext): BoardPlan[] {
  const boardNames = splitLooseList(ctx.boards)
  const sizes = parseSizes(ctx.sizes)
  const total = Math.max(boardNames.length, sizes.length, 1)

  const boards: BoardPlan[] = []
  for (let i = 0; i < total; i++) {
    const name = boardNames[i] || `Board ${i + 1}`
    const size = sizes[i] || sizes[0] || { width: 1920, height: 1080 }
    const ratio = Number((size.width / size.height).toFixed(3))
    const boardType = inferBoardType(name, ratio)
    boards.push({
      board_name: name,
      width: size.width,
      height: size.height,
      aspect_ratio: ratio,
      board_type: boardType,
      safe_zones: conservativeSafeZone(boardType, ratio),
      bend_zones: conservativeBendZones(boardType, ratio, `${ctx.notes || ''} ${ctx.boards || ''}`),
      camera_breaks: conservativeCameraBreaks(boardType, `${ctx.notes || ''} ${ctx.boards || ''}`),
      content_strategy: boardRule('multi_board_package', boardType),
    })
  }

  return boards
}

function buildCreativeBrief(ctx: DesignContext, requestType: RequestType, boards: BoardPlan[]): CreativeBrief {
  const allText = `${ctx.title} ${ctx.notes || ''} ${ctx.client || ''}`
  const matchup = extractMatchup(allText)
  const scoreOrCountdown = extractScoreOrCountdown(allText)
  const sponsor = extractSponsor(allText)

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
    numeric_priority: requestType === 'final_score' || requestType === 'countdown' ? 'high' : 'medium',
    logo_priority: requestType === 'logo_loop' || requestType === 'fascia_pattern' ? 'high' : 'medium',
    sponsor_placement: sponsor ? 'Sponsor lockup anchored in a protected lower corner or repeated as a restrained fascia beat.' : 'No sponsor required unless a board specifically calls for it.',
    screen_specific_adaptation_strategy: boards.map((board) => {
      if (board.board_type === 'fascia') return `${board.board_name}: use repeating modules, short phrases, logos, or pattern rhythm; no dense copy.`
      if (board.board_type === 'side_panel') return `${board.board_name}: use a stacked logo/message lockup with one dominant word, score, or timer.`
      if (board.board_type === 'stat_area') return `${board.board_name}: prioritize numbers and labels over decorative art.`
      return `${board.board_name}: carry the same visual system with one dominant message and protected sponsor/logo support.`
    }),
  }
}

function buildProofPreview(board: BoardPlan, requestType: RequestType, brief: CreativeBrief): string {
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

function buildPlan(ctx: DesignContext): PackagePlan {
  const boards = buildBoards(ctx)
  const requestType = classifyRequest(ctx, boards.length)
  const allText = `${ctx.title} ${ctx.notes || ''} ${ctx.client || ''} ${ctx.boards || ''}`
  const matchup = extractMatchup(allText)
  const brief = buildCreativeBrief(ctx, requestType, boards)
  const sport = inferSport(allText)
  const eventType = inferEventType(allText)
  const sponsor = extractSponsor(allText)
  const scoreOrCountdown = extractScoreOrCountdown(allText)

  const updatedBoards = boards.map((board) => ({
    ...board,
    content_strategy: boardRule(requestType, board.board_type),
  }))

  const proofs: ProofPlan[] = updatedBoards.map((board) => ({
    board_label: board.board_name,
    dimensions: `${board.width}x${board.height}`,
    bend_marker: board.bend_zones.length > 0
      ? board.bend_zones.map(zone => `${zone.start_pct}-${zone.end_pct}% (${zone.note})`).join('; ')
      : 'No explicit bend marker; use conservative center-safe composition.',
    safe_content_area: `${100 - board.safe_zones.left_pct - board.safe_zones.right_pct}% x ${100 - board.safe_zones.top_pct - board.safe_zones.bottom_pct}% usable area. ${board.safe_zones.note}`,
    simplified_proof_preview: buildProofPreview(board, requestType, brief),
    export_metadata: {
      filename_stub: compact(board.board_name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board-proof',
      aspect_ratio: `${board.aspect_ratio}:1`,
      board_type: board.board_type,
    },
  }))

  return {
    generation_mode: 'venue_signage_package',
    request_type: requestType,
    sport,
    event_type: eventType,
    home_team: matchup.home,
    away_team: matchup.away,
    score_or_countdown: scoreOrCountdown,
    sponsor,
    venue_name: ctx.venue,
    concept_system: {
      art_direction: 'Dark textured sports-broadcast signage package with one clear message per screen and premium in-venue playback energy.',
      palette: ['charcoal black', 'white', 'arena orange accent'],
      typography: 'Condensed bold display type with broadcast-safe secondary text.',
      texture: 'Subtle grit / scoreboard grid / fieldhouse texture only where it supports readability.',
      hierarchy: 'Single dominant message, secondary support line, restrained sponsor/logo treatment.',
    },
    creative_brief: brief,
    boards: updatedBoards,
    proofs,
    safeguards: [
      'Do not generate a social-post poster, hero player artwork, or photoreal concept art unless the brief explicitly asks for it.',
      'No critical content across bends, seams, or camera breaks.',
      'Long narrow boards should use repetition, rhythm, logos, patterns, or one oversized short message.',
      'Keep typography distance-readable and production-safe.',
      'All boards must share one visual system adapted to geometry, not separate unrelated concepts.',
    ],
  }
}

function buildImagePrompt(ctx: DesignContext, plan: PackagePlan): string {
  const boardLines = plan.boards.map((board, index) =>
    `${index + 1}. ${board.board_name} — ${board.width}x${board.height} (${board.board_type}), safe zone L${board.safe_zones.left_pct}/R${board.safe_zones.right_pct}/T${board.safe_zones.top_pct}/B${board.safe_zones.bottom_pct}, bends: ${board.bend_zones.length > 0 ? board.bend_zones.map(z => `${z.start_pct}-${z.end_pct}%`).join(', ') : 'none'}, strategy: ${board.content_strategy.layout_pattern}; primary: ${board.content_strategy.primary_focus}; secondary: ${board.content_strategy.secondary_focus}.`
  ).join(' ')

  const negatives = [
    'Do NOT make a generic sports poster, social graphic, player collage, cinematic key art, or hype wallpaper.',
    'Do NOT use photoreal stadium photography, dramatic lens flares, floating athletes, or marketing-poster composition.',
    'Do NOT put dense paragraphs, tiny sponsor logos, or critical copy across bends, seams, or camera breaks.',
    'Do NOT invent a separate visual concept for each board; adapt one modular system across all boards.',
  ].join(' ')

  const venue = compact(ctx.venue) || 'arena venue'
  const title = compact(ctx.title) || 'game-night package'
  const notes = compact(ctx.notes, 600)

  return [
    'Create a production-minded arena signage proof sheet, not a poster.',
    `Show a labeled multi-panel proof board for ${title} at ${venue}.`,
    `Request type: ${plan.request_type}. Sport: ${plan.sport || 'sports venue'}. Event type: ${plan.event_type || 'game night'}.`,
    `Primary message: ${plan.creative_brief.primary_message}. Secondary message: ${plan.creative_brief.secondary_message}. Sponsor: ${plan.sponsor || 'none'}.`,
    `Visual system: ${plan.concept_system.art_direction} Palette: ${plan.concept_system.palette.join(', ')}. Typography: ${plan.concept_system.typography}.`,
    `Board adaptations: ${boardLines}`,
    'Render the output like a professional design proof sheet with flat board crops, dimension labels, dashed safe-area guides, bend markers, and concise board annotations.',
    'Each panel should resemble a believable in-venue LED layout that a designer could refine and ship.',
    'One message per screen. Large condensed typography. Strong contrast. Modular geometry-aware composition. Repeating motifs on long ribbons.',
    notes ? `Brief notes: ${notes}.` : '',
    negatives,
  ].filter(Boolean).join(' ')
}

async function generateImage(prompt: string): Promise<Buffer> {
  if (!OPENAI_KEY) throw new Error('OpenAI API key not configured')
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      prompt,
      n: 1,
      size: AI_SIZE,
      quality: AI_QUALITY,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI image gen ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = data.data?.[0]
  if (!item) throw new Error('Empty image response')
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item.url) {
    const img = await fetch(item.url)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('No image data in response')
}

function storagePrompt(prompt: string, plan: PackagePlan): string {
  const summary = JSON.stringify({
    request_type: plan.request_type,
    creative_brief: plan.creative_brief,
    boards: plan.boards.map(board => ({
      board_name: board.board_name,
      dimensions: `${board.width}x${board.height}`,
      board_type: board.board_type,
    })),
  })
  return `${prompt}\n\nPLAN ${summary}`.slice(0, 2000)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const existsRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (existsRes.rows.length === 0) {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const d = await Designs.get(params.id) as any
      if (!d) return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      await query(
        `INSERT INTO design_requests (id, job_title, company_name, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          d.id,
          d.name || '(untitled)',
          d.designClient?.name || null,
          ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
          typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || ''),
        ]
      )
    } else {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
  }

  if (!OPENAI_KEY) {
    return NextResponse.json({ error: 'AI image generation is not configured on this environment' }, { status: 501 })
  }

  let ctx: DesignContext
  try {
    ctx = await loadDesignContext(params.id)
  } catch {
    return NextResponse.json({ error: 'Failed to load design context' }, { status: 500 })
  }

  const plan = buildPlan(ctx)
  const prompt = buildImagePrompt(ctx, plan)

  let bytes: Buffer
  try {
    bytes = await generateImage(prompt)
  } catch (err: any) {
    console.error('[generate-ai-proof] image gen failed:', err)
    return NextResponse.json({ error: err?.message || 'AI image generation failed' }, { status: 502 })
  }

  const filename = `ai-signage-proof-${Date.now()}.png`
  const contentType = 'image/png'

  let storageBackend: 's3' | 'postgres_bytea' = 'postgres_bytea'
  let storageKey: string | null = null
  let storageEtag: string | null = null
  let byteaData: Buffer | null = bytes

  if (isConfigured()) {
    try {
      const uploaded = await uploadProof({
        designRequestId: params.id,
        filename,
        contentType,
        body: bytes,
      })
      storageBackend = 's3'
      storageKey = uploaded.key
      storageEtag = uploaded.etag
      byteaData = null
    } catch (err) {
      console.error('[generate-ai-proof] MinIO failed, falling back to bytea:', err)
    }
  }

  const inserted = await query(
    `INSERT INTO design_request_files
       (design_request_id, filename, mime_type, size_bytes, data, uploaded_by,
        storage_key, storage_backend, storage_etag, version,
        is_ai_generated, ai_prompt, ai_model)
     SELECT
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE(MAX(version), 0) + 1,
       true, $10, $11
     FROM design_request_files
     WHERE design_request_id = $1
     RETURNING id, filename, mime_type, size_bytes, storage_backend, created_at, version`,
    [
      params.id,
      filename,
      contentType,
      bytes.byteLength,
      byteaData,
      auth.userId,
      storageKey,
      storageBackend,
      storageEtag,
      storagePrompt(prompt, plan),
      AI_MODEL,
    ]
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
  const downloadUrl = `${baseUrl}/api/design-requests/${params.id}/proofs/${inserted.rows[0].id}/download`

  return NextResponse.json({
    proof: {
      id: inserted.rows[0].id,
      filename: inserted.rows[0].filename,
      mime_type: inserted.rows[0].mime_type,
      size_bytes: Number(inserted.rows[0].size_bytes || 0),
      backend: inserted.rows[0].storage_backend,
      uploaded_at: inserted.rows[0].created_at,
      version: Number(inserted.rows[0].version || 1),
      is_ai_generated: true,
      ai_model: AI_MODEL,
      download_url: downloadUrl,
    },
    plan,
    prompt_used: prompt,
  })
}
