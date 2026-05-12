export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const ALLOWED_CATEGORIES = new Set(['ai', 'cloud', 'domain', 'dev_tool', 'comms', 'storage', 'monitoring', 'other'])

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({})) as {
    vendor?: string
    amount?: number | string
    currency?: string
    paid_at?: string
    invoice_number?: string
    category?: string
    notes?: string
  }

  const vendor = (body.vendor || '').trim()
  if (!vendor) return NextResponse.json({ error: 'vendor required' }, { status: 400 })

  const rawAmount = body.amount
  let amount_cents: number | null = null
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
    const n = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount).replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
    amount_cents = Math.round(n * 100)
  }

  const category = body.category && ALLOWED_CATEGORIES.has(body.category) ? body.category : 'other'
  const currency = body.currency || 'USD'
  const paid_at = body.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at) ? body.paid_at : null
  const invoice_number = body.invoice_number?.trim() || null

  // Dedup on (vendor, invoice_number) if invoice present
  if (invoice_number) {
    const dup = await query(
      `SELECT id FROM infra_receipts WHERE vendor_canonical = $1 AND invoice_number = $2 LIMIT 1`,
      [vendor, invoice_number]
    )
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: 'A receipt with this vendor + invoice number already exists', id: dup.rows[0].id }, { status: 409 })
    }
  }

  // Synthetic file_key for the no-file row so the NOT NULL constraint holds.
  const synthetic_key = `infra-receipts/manual/${randomUUID()}`

  const result = await query(
    `INSERT INTO infra_receipts (
       vendor_raw, vendor_canonical, category,
       amount_cents, currency, paid_at, invoice_number,
       file_key, original_filename, file_mime,
       extracted_fields, extractor_provider, reasoner_model, notes, uploaded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      vendor,
      vendor,
      category,
      amount_cents,
      currency,
      paid_at,
      invoice_number,
      synthetic_key,
      null,
      null,
      JSON.stringify({ manual_entry: true }),
      'manual',
      'manual',
      body.notes || null,
      auth.userId,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id })
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // YYYY-MM, optional
  let monthFilter = ''
  const params: unknown[] = []
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    monthFilter = `WHERE TO_CHAR(paid_at, 'YYYY-MM') = $1`
    params.push(monthParam)
  }

  const rowsResult = await query(
    `SELECT
       id,
       vendor_raw,
       vendor_canonical,
       category,
       amount_cents,
       currency,
       TO_CHAR(period_start, 'YYYY-MM-DD') as period_start,
       TO_CHAR(period_end, 'YYYY-MM-DD') as period_end,
       invoice_number,
       TO_CHAR(paid_at, 'YYYY-MM-DD') as paid_at,
       file_key,
       original_filename,
       extractor_confidence,
       extractor_provider,
       reasoner_model,
       extracted_fields,
       created_at
     FROM infra_receipts
     ${monthFilter}
     ORDER BY paid_at DESC NULLS LAST, created_at DESC`,
    params
  )

  const vendorMonthsResult = await query(
    `SELECT vendor_canonical, TO_CHAR(paid_at, 'YYYY-MM') as month
     FROM infra_receipts
     WHERE vendor_canonical IS NOT NULL AND paid_at IS NOT NULL
     GROUP BY vendor_canonical, TO_CHAR(paid_at, 'YYYY-MM')`
  )
  const vendorMonthCount = new Map<string, Set<string>>()
  for (const row of vendorMonthsResult.rows) {
    if (!vendorMonthCount.has(row.vendor_canonical)) vendorMonthCount.set(row.vendor_canonical, new Set())
    vendorMonthCount.get(row.vendor_canonical)!.add(row.month)
  }

  const currentMonth = new Date().toISOString().slice(0, 7)
  const focusMonth = monthParam || currentMonth

  const receipts = rowsResult.rows.map((row) => ({
    id: row.id,
    vendor_raw: row.vendor_raw,
    vendor_canonical: row.vendor_canonical,
    category: row.category,
    amount_cents: row.amount_cents,
    currency: row.currency,
    period_start: row.period_start,
    period_end: row.period_end,
    invoice_number: row.invoice_number,
    paid_at: row.paid_at,
    original_filename: row.original_filename,
    extractor_confidence: row.extractor_confidence ? Number(row.extractor_confidence) : null,
    extractor_provider: row.extractor_provider,
    reasoner_model: row.reasoner_model,
    extracted_fields: row.extracted_fields,
    is_recurring: (vendorMonthCount.get(row.vendor_canonical)?.size || 0) >= 2,
    created_at: row.created_at,
  }))

  // Vendor rollup for the focus month + "missing this month" detection
  const vendorTotals = new Map<string, { vendor: string; category: string | null; total_cents: number; count: number; is_recurring: boolean; missing_this_month: boolean; last_paid: string | null }>()
  for (const row of receipts) {
    if (!row.vendor_canonical) continue
    const key = row.vendor_canonical
    const entry = vendorTotals.get(key) || {
      vendor: key,
      category: row.category,
      total_cents: 0,
      count: 0,
      is_recurring: row.is_recurring,
      missing_this_month: false,
      last_paid: null,
    }
    entry.total_cents += row.amount_cents || 0
    entry.count += 1
    if (!entry.last_paid || (row.paid_at && row.paid_at > entry.last_paid)) entry.last_paid = row.paid_at
    vendorTotals.set(key, entry)
  }

  // Find recurring vendors that have no entry in the focus month
  const missingVendors: Array<{ vendor: string; category: string | null; last_paid: string | null }> = []
  for (const [vendor, months] of vendorMonthCount.entries()) {
    if (months.size < 2) continue
    if (months.has(focusMonth)) continue
    // Last paid month
    const sorted = Array.from(months).sort()
    const last = sorted[sorted.length - 1]
    // Only flag if we have a charge in the last 2 months — old vendors are noise
    const monthAgo = new Date(focusMonth + '-01')
    monthAgo.setMonth(monthAgo.getMonth() - 2)
    const cutoff = monthAgo.toISOString().slice(0, 7)
    if (last < cutoff) continue
    // Find category from the most recent receipt with this vendor
    const recent = receipts.find((r) => r.vendor_canonical === vendor)
    missingVendors.push({ vendor, category: recent?.category || null, last_paid: last })
  }

  const categoryTotals = new Map<string, number>()
  let monthTotalCents = 0
  for (const r of receipts) {
    if (!r.amount_cents) continue
    monthTotalCents += r.amount_cents
    const cat = r.category || 'other'
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + r.amount_cents)
  }

  return NextResponse.json({
    month: focusMonth,
    month_total_cents: monthTotalCents,
    receipts,
    vendor_rollup: Array.from(vendorTotals.values()).sort((a, b) => b.total_cents - a.total_cents),
    category_breakdown: Array.from(categoryTotals.entries()).map(([category, total_cents]) => ({ category, total_cents })).sort((a, b) => b.total_cents - a.total_cents),
    missing_recurring_vendors: missingVendors,
  })
}
