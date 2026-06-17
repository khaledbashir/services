export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  createProposalPortal,
  listProposalPortalsForWorkspace,
} from '@/lib/proposal-portals-db'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const portals = await listProposalPortalsForWorkspace()
    return NextResponse.json({ portals })
  } catch (error) {
    console.error('[proposal-portals GET] error:', error)
    return NextResponse.json({ error: 'Failed to load portals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json().catch(() => ({}))
    const clientName = typeof body.clientName === 'string' ? body.clientName : undefined
    const title = typeof body.title === 'string' ? body.title : undefined
    const recipe = typeof body.recipe === 'string' ? body.recipe : undefined

    const portal = await createProposalPortal({
      userId: auth.userId,
      email: auth.email,
      clientName,
      title,
      recipe,
    })

    return NextResponse.json(portal)
  } catch (error) {
    console.error('[proposal-portals POST] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create portal' },
      { status: 500 },
    )
  }
}
