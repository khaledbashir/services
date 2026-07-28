export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'

// GET /api/request-hub/meta — everything the wizard/board/table needs to render:
// types + questions, statuses, rubric, venues, and (for leadership) staff for
// assignment pickers.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )

  const venues = await query(`SELECT id, name FROM venues ORDER BY name ASC`)

  let staff: any[] = []
  if (canSeeAll(perms)) {
    const res = await query(
      `SELECT id, full_name, role FROM staff WHERE is_active = true ORDER BY full_name ASC`
    )
    staff = res.rows
  }

  return NextResponse.json({
    types: config.types,
    statuses: config.statuses,
    rubric: config.rubric,
    responseTimeText: config.responseTimeText,
    venues: venues.rows,
    staff,
    permissions: perms,
  })
}
