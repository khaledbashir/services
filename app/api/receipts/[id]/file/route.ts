export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getReceiptSignedUrl } from '@/lib/receipt-storage'

export async function GET(
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
  const url = await getReceiptSignedUrl(result.rows[0].file_key)
  return NextResponse.redirect(url, 302)
}
