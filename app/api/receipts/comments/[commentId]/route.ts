export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { commentId } = await params
  await query(`DELETE FROM infra_receipt_comments WHERE id = $1`, [commentId])
  return NextResponse.json({ deleted: true })
}
