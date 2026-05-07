import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Admin-only ledger of monthly service-contract payments. Drives the
// "paid / pending / overdue" pill on the public transparency dashboard.

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const r = await query(
    `SELECT month, status, amount, paid_at, invoice_number, notes, updated_at
       FROM service_payments
      ORDER BY month DESC
      LIMIT 24`
  )
  return NextResponse.json({ payments: r.rows })
}

// POST { month: 'YYYY-MM', status: 'paid'|'pending'|'overdue'|'invoiced',
//        amount?, paid_at?, invoice_number?, notes? }
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const month = typeof body.month === 'string' ? body.month : ''
  const status = typeof body.status === 'string' ? body.status : ''

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be 'YYYY-MM'" }, { status: 400 })
  }
  if (!['paid', 'pending', 'overdue', 'invoiced'].includes(status)) {
    return NextResponse.json({ error: 'status must be paid|pending|overdue|invoiced' }, { status: 400 })
  }

  const amount = body.amount == null ? null : Number(body.amount)
  const paidAt = typeof body.paid_at === 'string' ? body.paid_at : null
  const invoiceNumber = typeof body.invoice_number === 'string' ? body.invoice_number : null
  const notes = typeof body.notes === 'string' ? body.notes : null

  await query(
    `INSERT INTO service_payments (month, status, amount, paid_at, invoice_number, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (month) DO UPDATE
       SET status = EXCLUDED.status,
           amount = COALESCE(EXCLUDED.amount, service_payments.amount),
           paid_at = COALESCE(EXCLUDED.paid_at, service_payments.paid_at),
           invoice_number = COALESCE(EXCLUDED.invoice_number, service_payments.invoice_number),
           notes = COALESCE(EXCLUDED.notes, service_payments.notes),
           updated_at = NOW()`,
    [month, status, amount, paidAt, invoiceNumber, notes]
  )

  return NextResponse.json({ ok: true, month, status })
}
