export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { fetchReceiptBytes } from '@/lib/receipt-storage'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month=YYYY-MM required' }, { status: 400 })
  }

  const result = await query(
    `SELECT
       id,
       vendor_raw,
       vendor_canonical,
       category,
       amount_cents,
       currency,
       TO_CHAR(paid_at, 'YYYY-MM-DD') as paid_at,
       TO_CHAR(period_start, 'YYYY-MM-DD') as period_start,
       TO_CHAR(period_end, 'YYYY-MM-DD') as period_end,
       invoice_number,
       file_key,
       original_filename
     FROM infra_receipts
     WHERE TO_CHAR(paid_at, 'YYYY-MM') = $1
     ORDER BY paid_at ASC, vendor_canonical ASC`,
    [month]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: `No receipts found for ${month}` }, { status: 404 })
  }

  const zip = new AdmZip()

  const csvHeader = 'paid_at,vendor_canonical,vendor_raw,category,amount,currency,invoice_number,period_start,period_end,filename\n'
  const csvBody = result.rows
    .map((row) => [
      csvEscape(row.paid_at),
      csvEscape(row.vendor_canonical),
      csvEscape(row.vendor_raw),
      csvEscape(row.category),
      csvEscape(row.amount_cents !== null ? (row.amount_cents / 100).toFixed(2) : ''),
      csvEscape(row.currency || ''),
      csvEscape(row.invoice_number || ''),
      csvEscape(row.period_start || ''),
      csvEscape(row.period_end || ''),
      csvEscape(row.original_filename || ''),
    ].join(','))
    .join('\n')

  const totalCents = result.rows.reduce((sum, row) => sum + (row.amount_cents || 0), 0)
  const totalLine = `\n,,,TOTAL,${(totalCents / 100).toFixed(2)},USD,,,,\n`

  zip.addFile(`summary-${month}.csv`, Buffer.from(csvHeader + csvBody + totalLine, 'utf-8'))

  const seenNames = new Map<string, number>()
  for (const row of result.rows) {
    try {
      const bytes = await fetchReceiptBytes(row.file_key)
      const base = row.original_filename || `${row.vendor_canonical || 'receipt'}.pdf`
      const safeBase = base.replace(/[/\\]/g, '_')
      const count = seenNames.get(safeBase) || 0
      seenNames.set(safeBase, count + 1)
      const finalName = count === 0 ? safeBase : safeBase.replace(/(\.[^.]+)?$/, `-${count + 1}$1`)
      zip.addFile(`receipts/${finalName}`, bytes)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      zip.addFile(`MISSING-${row.id}.txt`, Buffer.from(`Could not fetch ${row.file_key}: ${message}`, 'utf-8'))
    }
  }

  const zipBuffer = zip.toBuffer()

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="anc-receipts-${month}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  })
}
