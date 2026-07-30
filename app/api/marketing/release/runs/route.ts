export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { listReleaseRuns } from '@/lib/marketing/release-runs'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  try {
    return NextResponse.json({ runs: await listReleaseRuns(40) })
  } catch (err) {
    console.error('release runs list failed:', err)
    return NextResponse.json({ runs: [] })
  }
}
