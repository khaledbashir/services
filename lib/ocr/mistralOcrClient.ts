/**
 * Mistral OCR client — single-page vision OCR for drawing title blocks.
 *
 * Borrowed from the sister app's RFP pipeline
 * (services/rfp/unified/mistralOcrClient.ts) and stripped down for the ANC
 * submittal auto-create flow. The rag2 version returned domain-specific
 * ExtractedLEDSpec[] via Mistral Document AI annotations; here we only need the
 * raw OCR text (markdown + any tables/header/footer) per page — the structured
 * "what submittal is this" step runs afterward via the app's own LLM helper
 * (lib/ocr/submittal-extract.ts). That keeps this module self-contained: Node
 * built-ins + fetch only, no rag2 types.
 *
 * Env (all three required to run):
 *   MISTRAL_API_KEY       — Mistral API key
 *   MISTRAL_OCR_MODEL     — defaults to "mistral-ocr-latest"
 *   MISTRAL_API_BASE_URL  — defaults to "https://api.mistral.ai"
 */

const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE_URL || 'https://api.mistral.ai'
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || ''
const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest'

export interface OcrPageResult {
  index: number
  markdown: string
  tables: Array<{ id: string; content: string; format: string }>
  header: string | null
  footer: string | null
}

interface MistralOcrPageRaw {
  index: number
  markdown: string
  tables?: Array<{ id: string; content: string; format: string }>
  header?: string | null
  footer?: string | null
}

interface MistralOcrResultRaw {
  pages?: MistralOcrPageRaw[]
}

/**
 * Whether the Mistral OCR integration is configured. Mirrors the SendGrid
 * graceful-degradation pattern in lib/email.ts — callers check this and return
 * a clear "OCR not configured" message instead of throwing a raw key error.
 */
export function isMistralOcrConfigured(): boolean {
  return Boolean(MISTRAL_API_KEY)
}

/**
 * OCR a single page image (JPEG/PNG on disk) and return its text content.
 * Extracts header/footer too — title blocks usually live in the page footer of
 * a drawing sheet, which is exactly what we want for sheet number + title.
 */
export async function extractSinglePage(imagePath: string, pageNumber: number): Promise<OcrPageResult> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY not set — cannot call Mistral OCR')
  }

  const { readFile } = await import('fs/promises')
  const imageBuffer = await readFile(imagePath)
  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:image/jpeg;base64,${base64}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)

  try {
    const res = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: { type: 'image_url', image_url: dataUrl },
        include_image_base64: false,
        table_format: 'html',
        extract_header: true,
        extract_footer: true,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Mistral OCR ${res.status}: ${text.slice(0, 300)}`)
    }

    const data = (await res.json()) as MistralOcrResultRaw
    const page = data.pages?.[0]
    if (!page) {
      return { index: pageNumber, markdown: '', tables: [], header: null, footer: null }
    }

    return {
      index: pageNumber,
      markdown: page.markdown || '',
      tables: page.tables || [],
      header: page.header ?? null,
      footer: page.footer ?? null,
    }
  } catch (err) {
    clearTimeout(timer)
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Mistral OCR page ${pageNumber} failed: ${message}`)
  }
}

/** Flatten a page's OCR result into a single text block for the extractor. */
export function pageText(page: OcrPageResult): string {
  const parts: string[] = []
  if (page.header) parts.push(`HEADER: ${page.header}`)
  if (page.markdown) parts.push(page.markdown)
  if (page.tables.length) parts.push('TABLES:\n' + page.tables.map((t) => t.content).join('\n'))
  if (page.footer) parts.push(`FOOTER: ${page.footer}`)
  return parts.join('\n\n')
}
