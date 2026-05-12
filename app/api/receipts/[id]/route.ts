export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { deleteReceipt } from '@/lib/receipt-storage'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await params
  const result = await query(`SELECT file_key FROM infra_receipts WHERE id = $1`, [id])
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }
  const fileKey = result.rows[0].file_key
  await query(`DELETE FROM infra_receipts WHERE id = $1`, [id])
  try {
    await deleteReceipt(fileKey)
  } catch {
    // MinIO object missing is fine — row is already deleted.
  }
  return NextResponse.json({ deleted: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const allowed: Array<{ field: string; column: string }> = [
    { field: 'vendor_canonical', column: 'vendor_canonical' },
    { field: 'category', column: 'category' },
    { field: 'amount_cents', column: 'amount_cents' },
    { field: 'currency', column: 'currency' },
    { field: 'invoice_number', column: 'invoice_number' },
    { field: 'paid_at', column: 'paid_at' },
    { field: 'notes', column: 'notes' },
  ]

  const sets: string[] = []
  const args: unknown[] = []
  for (const { field, column } of allowed) {
    if (body[field] !== undefined) {
      args.push(body[field])
      sets.push(`${column} = $${args.length}`)
    }
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  args.push(id)
  await query(
    `UPDATE infra_receipts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${args.length}`,
    args
  )
  return NextResponse.json({ updated: true })
}
