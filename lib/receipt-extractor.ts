/**
 * Receipt Extractor — pluggable provider for OCR + structured-field
 * extraction of SaaS/cloud receipts (PDF or image).
 *
 * Default provider: Mistral OCR (`mistral-ocr-latest`) — purpose-built for
 * documents/invoices, returns structured markdown + tables natively.
 *
 * Swap via env: `RECEIPT_EXTRACTOR_PROVIDER=mistral` (only mistral wired
 * today; the interface is here so adding more is plug-in).
 */

export interface ExtractedReceipt {
  vendor: string | null
  amount_cents: number | null
  currency: string
  period_start: string | null    // YYYY-MM-DD
  period_end: string | null      // YYYY-MM-DD
  invoice_number: string | null
  paid_at: string | null         // YYYY-MM-DD
  raw_text: string
  confidence: number             // 0..1
  provider: string
}

export interface ReceiptExtractor {
  extract(file: Buffer, mime: string, filename: string): Promise<ExtractedReceipt>
}

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || ''
const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest'
const MISTRAL_BASE_URL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'

function parseAmountToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Math.round(raw * 100)
  const str = String(raw).trim().replace(/[^\d.,-]/g, '')
  if (!str) return null
  // Treat the last separator as the decimal mark.
  const lastDot = str.lastIndexOf('.')
  const lastComma = str.lastIndexOf(',')
  let normalized = str
  if (lastComma > lastDot) {
    normalized = str.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = str.replace(/,/g, '')
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return match[0]
  // US-style M/D/YYYY or MM/DD/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) {
    const [, m, d, y] = us
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // ISO datetime — keep the date part
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (iso) return iso[0].slice(0, 10)
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

class MistralOcrExtractor implements ReceiptExtractor {
  async extract(file: Buffer, mime: string, filename: string): Promise<ExtractedReceipt> {
    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY env var not configured')
    }

    const dataUrl = `data:${mime};base64,${file.toString('base64')}`
    const documentPayload = mime === 'application/pdf'
      ? { type: 'document_url' as const, document_url: dataUrl, document_name: filename }
      : { type: 'image_url' as const, image_url: dataUrl }

    const res = await fetch(`${MISTRAL_BASE_URL}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: documentPayload,
        include_image_base64: false,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Mistral OCR failed: HTTP ${res.status} ${errText.slice(0, 300)}`)
    }

    const data = await res.json() as {
      pages?: Array<{ markdown?: string; text?: string }>
      usage_info?: unknown
    }
    const pages = data.pages || []
    const rawText = pages.map((p) => p.markdown || p.text || '').join('\n\n').trim()

    if (!rawText) {
      return {
        vendor: null,
        amount_cents: null,
        currency: 'USD',
        period_start: null,
        period_end: null,
        invoice_number: null,
        paid_at: null,
        raw_text: '',
        confidence: 0,
        provider: 'mistral-ocr',
      }
    }

    // Light field extraction from the OCR markdown. The reasoning step
    // (lib/receipt-reasoner.ts) does the heavy interpretation — this just
    // surfaces the obvious patterns most receipts share.
    const lower = rawText.toLowerCase()

    const vendorMatch = rawText.match(/(?:from|vendor|company|seller|paid to|sold by|^)\s*[:\-]?\s*([A-Z][A-Za-z0-9.&,'\- ]{2,80}(?:LLC|Inc\.?|OpCo|Corp\.?|Co\.|Ltd\.?|LP|GmbH)?)/m)
      || rawText.match(/^\s*#?\s*([A-Z][A-Za-z0-9.&,'\- ]{2,80})\s*$/m)
    const vendor = vendorMatch?.[1]?.trim() || null

    const amountMatch = rawText.match(/(?:total|amount due|grand total|amount paid|paid amount|total paid|balance due)\s*[:\-]?\s*\$?\s*([0-9][0-9,.]*)/i)
      || rawText.match(/\$\s*([0-9][0-9,.]*)\s*(?:USD|EUR|GBP)?\s*(?:total|paid)?/i)
    const amount_cents = parseAmountToCents(amountMatch?.[1] ?? null)

    const currencyMatch = rawText.match(/\b(USD|EUR|GBP|CAD|AUD)\b/) || (rawText.includes('$') ? ['', 'USD'] : null)
    const currency = currencyMatch ? currencyMatch[1] : 'USD'

    const invoiceMatch = rawText.match(/(?:invoice\s*(?:number|no\.?|#)|receipt\s*(?:number|no\.?|#))\s*[:\-]?\s*([A-Z0-9\-]{4,40})/i)
    const invoice_number = invoiceMatch?.[1]?.trim() || null

    const paidMatch = rawText.match(/(?:paid|payment date|date paid|charged on|charge date)\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i)
    const paid_at = parseDate(paidMatch?.[1] ?? null)

    const periodMatch = rawText.match(/(?:service period|billing period|usage period|period)\s*[:\-]?\s*([A-Za-z0-9,\/\-\.]+)\s*(?:to|–|—|-)\s*([A-Za-z0-9,\/\-\.]+)/i)
    const period_start = parseDate(periodMatch?.[1] ?? null)
    const period_end = parseDate(periodMatch?.[2] ?? null)

    let confidence = 0.4
    if (vendor) confidence += 0.15
    if (amount_cents !== null) confidence += 0.2
    if (invoice_number) confidence += 0.1
    if (paid_at) confidence += 0.1
    if (lower.includes('invoice') || lower.includes('receipt')) confidence += 0.05
    confidence = Math.min(1, confidence)

    return {
      vendor,
      amount_cents,
      currency,
      period_start,
      period_end,
      invoice_number,
      paid_at,
      raw_text: rawText,
      confidence,
      provider: 'mistral-ocr',
    }
  }
}

export function getReceiptExtractor(): ReceiptExtractor {
  const provider = (process.env.RECEIPT_EXTRACTOR_PROVIDER || 'mistral').toLowerCase()
  if (provider === 'mistral') return new MistralOcrExtractor()
  throw new Error(`Unknown RECEIPT_EXTRACTOR_PROVIDER: ${provider}`)
}
