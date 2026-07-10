export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getDesignActivity } from '@/lib/design-activity'

// Ticket history timeline (Charlie 2026-07-10): the full activity trail for one
// design request — status changes, time logged, proof creation, client
// responses, assignments, reschedules, comments — newest first.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  try {
    const activity = await getDesignActivity(params.id)
    return NextResponse.json({ activity })
  } catch (err) {
    console.error('[design-requests/activity] failed:', err)
    return NextResponse.json({ error: 'Could not load ticket history.' }, { status: 500 })
  }
}
