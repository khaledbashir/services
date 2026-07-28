export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'
import { createRequest, listRequests } from '@/lib/request-hub/core'

// GET /api/request-hub — list requests.
// Leadership/assessors see everything; everyone else sees their own.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )
  const sp = request.nextUrl.searchParams
  const mine = sp.get('mine') === '1'
  const seeAll = canSeeAll(perms) && !mine

  const rows = await listRequests({
    status: sp.get('status'),
    type: sp.get('type'),
    search: sp.get('q'),
    includeDrafts: true,
    scopeToRequesterId: seeAll ? null : auth.userId,
  })
  // Drafts are private to their author regardless of role.
  const visible = rows.filter((r) => r.status !== 'draft' || r.requester_id === auth.userId)

  return NextResponse.json({ requests: visible, permissions: perms, viewerId: auth.userId })
}

// POST /api/request-hub — create a request (draft by default).
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const config = await getHubConfig()
  const type = String(body.type || 'idea')
  if (!config.types.some((t) => t.key === type)) {
    return NextResponse.json({ error: `Unknown request type: ${type}` }, { status: 400 })
  }

  const row = await createRequest({
    type,
    status: body.status === 'submitted' ? 'submitted' : 'draft',
    title: body.title || null,
    summary: body.summary || null,
    answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
    urgency: body.urgency || null,
    deadline: body.deadline || null,
    deadlineReason: body.deadline_reason || null,
    constraintsNote: body.constraints_note || null,
    team: body.team || null,
    venueId: body.venue_id || null,
    requester: { userId: auth.userId, fullName: auth.fullName, email: auth.email },
    source: 'web',
  })

  return NextResponse.json({ request: row }, { status: 201 })
}
