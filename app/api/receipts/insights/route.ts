export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getReceiptInsights } from '@/lib/receipt-insights'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true'

  try {
    const insights = await getReceiptInsights({ force })
    return NextResponse.json(insights)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Insights failed' }, { status: 500 })
  }
}
