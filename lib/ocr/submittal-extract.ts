/**
 * Structured submittal extraction — turns raw drawing OCR text into a list of
 * detected submittal items { sheetNumber, title, revision, packageType }.
 *
 * Runs after Mistral OCR (lib/ocr/mistralOcrClient.ts). Reuses the dashboard's
 * existing LLM configuration (AI_PROVIDERS_JSON or the AI_API_KEY/AI_BASE_URL/
 * AI_MODEL fallback — the same env the AI assistant uses in lib/ai/agent.ts) so
 * there's no new provider to wire. Provider-agnostic by design: any
 * OpenAI-compatible chat endpoint works.
 *
 * If no LLM is configured, falls back to a deterministic regex pass over the
 * OCR text so the feature still produces sensible detections from clean title
 * blocks (sheet numbers like AV2.04, TL3.01, E-101) without an LLM round-trip.
 */

export interface DetectedSubmittal {
  sheetNumber: string
  title: string
  revision: string
  packageType: string
  confidence: number
}

interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

// Same provider-loading shape as lib/ai/agent.ts (kept local so this module
// has no dependency on the agent runtime). AI_PROVIDERS_JSON wins; otherwise the
// single-provider AI_API_KEY fallback.
function loadProvider(): ProviderConfig | null {
  const raw = process.env.AI_PROVIDERS_JSON || ''
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as ProviderConfig[]
      const first = parsed.find((p) => p?.baseUrl && p?.apiKey && p?.model)
      if (first) return first
    } catch {
      /* fall through to single-provider */
    }
  }
  if (process.env.AI_API_KEY) {
    return {
      name: 'default',
      baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4.1-mini',
    }
  }
  return null
}

export function isExtractorConfigured(): boolean {
  return loadProvider() !== null
}

const EXTRACT_SYSTEM = `You read OCR text from architectural / AV / electrical construction drawing sheets for stadium and arena LED-display projects, and you extract the submittal items they represent.

Each drawing sheet has a TITLE BLOCK (usually bottom-right or in the footer) carrying:
- a SHEET NUMBER like "AV2.04", "TL3.01", "E-101", "S-201", "A1.1"
- a SHEET TITLE like "Main Videoboard Layout", "Ribbon Board Elevations", "Rack Elevations", "Electrical One-Line"
- a REVISION marker like "Rev 1", "R2", "Δ3", "Issue for Construction" (use "0" or "Initial" if none)

Group the detected sheets into submittal packages by discipline using these package types:
- "LED specs / drawings"  (AV / videoboard / ribbon / fascia / display sheets, prefix AV / TL / V)
- "Electrical permit set"  (electrical sheets, prefix E)
- "Structural permit set"  (structural sheets, prefix S)
- "One-lines / rack elevations"  (one-line diagrams, rack/control-room elevations)
- "General"  (anything that doesn't fit the above)

Return STRICT JSON only — no prose, no markdown fences. Shape:
{ "submittals": [ { "sheetNumber": string, "title": string, "revision": string, "packageType": string, "confidence": number } ] }
Confidence is 0..1 for how clearly the title block was readable. One entry per distinct drawing sheet. If the text shows a single multi-display schedule rather than per-sheet title blocks, emit one entry per display row.`

async function callExtractor(provider: ProviderConfig, ocrText: string): Promise<DetectedSubmittal[]> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `OCR text from the uploaded drawing pages:\n\n${ocrText.slice(0, 24_000)}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Submittal extractor ${provider.name} ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty extractor response')
  return parseDetected(content)
}

function parseDetected(content: string): DetectedSubmittal[] {
  // Strip accidental code fences, then JSON.parse.
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Last resort: find the first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) return []
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  const list = (parsed as { submittals?: unknown }).submittals
  if (!Array.isArray(list)) return []
  return list
    .map((row): DetectedSubmittal | null => {
      const r = row as Record<string, unknown>
      const sheetNumber = String(r.sheetNumber ?? '').trim()
      const title = String(r.title ?? '').trim()
      if (!sheetNumber && !title) return null
      return {
        sheetNumber: sheetNumber || 'TBD',
        title: title || sheetNumber,
        revision: String(r.revision ?? '').trim() || 'Initial',
        packageType: normalizePackage(String(r.packageType ?? '')),
        confidence: clampConfidence(r.confidence),
      }
    })
    .filter((x): x is DetectedSubmittal => x !== null)
}

const PACKAGE_TYPES = [
  'LED specs / drawings',
  'Electrical permit set',
  'Structural permit set',
  'One-lines / rack elevations',
  'General',
]

function normalizePackage(raw: string): string {
  const hit = PACKAGE_TYPES.find((p) => p.toLowerCase() === raw.toLowerCase().trim())
  if (hit) return hit
  const lc = raw.toLowerCase()
  if (/led|video|ribbon|fascia|display|av/.test(lc)) return 'LED specs / drawings'
  if (/elect/.test(lc)) return 'Electrical permit set'
  if (/struct/.test(lc)) return 'Structural permit set'
  if (/one[- ]?line|rack|elevation/.test(lc)) return 'One-lines / rack elevations'
  return 'General'
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.7
  return Math.min(1, Math.max(0, n))
}

// ---------------------------------------------------------------------------
// Deterministic fallback — used when no LLM is configured. Pulls sheet numbers
// out of the OCR text via the standard drawing-sheet numbering pattern and
// infers the package by discipline prefix.
// ---------------------------------------------------------------------------

const SHEET_RE = /\b([A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,2})?)\b/g

function packageFromPrefix(sheet: string): string {
  const prefix = (sheet.match(/^[A-Z]+/)?.[0] || '').toUpperCase()
  if (/^(AV|TL|V)$/.test(prefix)) return 'LED specs / drawings'
  if (prefix.startsWith('E')) return 'Electrical permit set'
  if (prefix.startsWith('S')) return 'Structural permit set'
  return 'General'
}

export function fallbackExtract(ocrText: string): DetectedSubmittal[] {
  const seen = new Map<string, DetectedSubmittal>()
  const lines = ocrText.split('\n')
  for (const line of lines) {
    const matches = line.match(SHEET_RE)
    if (!matches) continue
    for (const sheet of matches) {
      // Skip pure numbers / obvious non-sheet tokens.
      if (!/[A-Z]/.test(sheet) || seen.has(sheet)) continue
      // Title heuristic: the rest of the line after the sheet number.
      const title = line.replace(sheet, '').replace(/[|:\-–—]+/g, ' ').replace(/\s+/g, ' ').trim()
      seen.set(sheet, {
        sheetNumber: sheet,
        title: title || sheet,
        revision: (line.match(/\b(?:rev|r|issue)\.?\s*([0-9]+)\b/i)?.[1]) ? `Rev ${line.match(/\b(?:rev|r|issue)\.?\s*([0-9]+)\b/i)![1]}` : 'Initial',
        packageType: packageFromPrefix(sheet),
        confidence: 0.5,
      })
    }
  }
  return Array.from(seen.values())
}

/**
 * Extract detected submittals from OCR text. Uses the configured LLM when
 * available; otherwise falls back to the deterministic regex pass.
 */
export async function extractSubmittals(ocrText: string): Promise<{
  submittals: DetectedSubmittal[]
  method: 'llm' | 'fallback'
}> {
  const provider = loadProvider()
  if (provider) {
    try {
      const submittals = await callExtractor(provider, ocrText)
      if (submittals.length) return { submittals, method: 'llm' }
      // LLM ran but found nothing — try the regex pass before giving up.
      return { submittals: fallbackExtract(ocrText), method: 'fallback' }
    } catch (err) {
      console.warn('[ocr/submittal-extract] LLM extraction failed, using fallback:', err instanceof Error ? err.message : err)
      return { submittals: fallbackExtract(ocrText), method: 'fallback' }
    }
  }
  return { submittals: fallbackExtract(ocrText), method: 'fallback' }
}
