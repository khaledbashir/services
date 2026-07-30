export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getReleaseRun } from '@/lib/marketing/release-runs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  const { id } = await params
  const run = await getReleaseRun(id)
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ run })
}
