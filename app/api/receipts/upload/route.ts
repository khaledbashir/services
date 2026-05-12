export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { buildReceiptKey, uploadReceipt } from '@/lib/receipt-storage'
import { getReceiptExtractor } from '@/lib/receipt-extractor'
import { reasonAboutReceipt } from '@/lib/receipt-reasoner'
import { invalidateInsights } from '@/lib/receipt-insights'

interface HistoryRow {
  vendor_canonical: string | null
  category: string | null
  paid_at: string | null
  amount_cents: number | null
}

async function loadHistory(): Promise<HistoryRow[]> {
  const result = await query(
    `SELECT vendor_canonical, category, TO_CHAR(paid_at, 'YYYY-MM-DD') as paid_at, amount_cents
     FROM infra_receipts
     ORDER BY paid_at DESC NULLS LAST, created_at DESC
     LIMIT 300`
  )
  return result.rows
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
  }

  const extractor = getReceiptExtractor()
  const history = await loadHistory()
  const results: Array<{
    filename: string
    status: 'ok' | 'duplicate' | 'failed'
    id?: string
    vendor?: string
    amount_cents?: number | null
    paid_at?: string | null
    category?: string
    confidence?: number
    error?: string
  }> = []

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const mime = file.type || 'application/octet-stream'
      const filename = file.name || 'receipt.pdf'

      const extracted = await extractor.extract(buffer, mime, filename)

      // If Mistral can't find a payment date, fall back to today so the
      // row lands in the current month's view. The UI flags these with
      // "date estimated" so the user can edit.
      if (!extracted.paid_at) {
        extracted.paid_at = new Date().toISOString().slice(0, 10)
      }

      const insight = await reasonAboutReceipt({ extracted, history })

      // Idempotent dedupe on (vendor_canonical, invoice_number)
      if (extracted.invoice_number) {
        const existing = await query(
          `SELECT id FROM infra_receipts WHERE vendor_canonical = $1 AND invoice_number = $2 LIMIT 1`,
          [insight.vendor_canonical, extracted.invoice_number]
        )
        if (existing.rows.length > 0) {
          results.push({
            filename,
            status: 'duplicate',
            id: existing.rows[0].id,
            vendor: insight.vendor_canonical,
            amount_cents: extracted.amount_cents,
            paid_at: extracted.paid_at,
            category: insight.category,
            confidence: extracted.confidence,
          })
          continue
        }
      }

      const key = buildReceiptKey(filename, extracted.paid_at)
      await uploadReceipt({ key, contentType: mime, body: buffer })

      const inserted = await query(
        `INSERT INTO infra_receipts (
           vendor_raw, vendor_canonical, category,
           amount_cents, currency, period_start, period_end,
           invoice_number, paid_at,
           file_key, original_filename, file_mime, file_size,
           extracted_fields, raw_ocr_text,
           extractor_provider, extractor_confidence, reasoner_model,
           uploaded_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          extracted.vendor,
          insight.vendor_canonical,
          insight.category,
          extracted.amount_cents,
          extracted.currency,
          extracted.period_start,
          extracted.period_end,
          extracted.invoice_number,
          extracted.paid_at,
          key,
          filename,
          mime,
          buffer.byteLength,
          JSON.stringify({
            recurring_basis: insight.recurring_basis,
            is_recurring_signal: insight.is_recurring_signal,
          }),
          extracted.raw_text.slice(0, 20000),
          extracted.provider,
          extracted.confidence,
          insight.reasoner_model,
          auth.userId,
        ]
      )

      const id = inserted.rows[0].id
      history.unshift({
        vendor_canonical: insight.vendor_canonical,
        category: insight.category,
        paid_at: extracted.paid_at,
        amount_cents: extracted.amount_cents,
      })

      results.push({
        filename,
        status: 'ok',
        id,
        vendor: insight.vendor_canonical,
        amount_cents: extracted.amount_cents,
        paid_at: extracted.paid_at,
        category: insight.category,
        confidence: extracted.confidence,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      results.push({ filename: file.name || 'unknown', status: 'failed', error: message })
    }
  }

  invalidateInsights()
  return NextResponse.json({ results })
}
