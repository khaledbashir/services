export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getIntegrationStatuses } from '@/lib/request-hub/integrations'

// GET /api/request-hub/admin/integrations — honest connection status for each adapter.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const integrations = await getIntegrationStatuses()
  return NextResponse.json({ integrations })
}
