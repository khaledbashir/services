export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, getAuthUser, isAuthError } from '@/lib/rbac'
import {
  getProposalPortalById,
  serializeProposalPortalForClient,
  updateProposalPortal,
} from '@/lib/proposal-portals-db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const portal = await getProposalPortalById(id)
  if (!portal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!portal.is_public) {
    const auth = await getAuthUser(request)
    if (!auth || !['manager', 'tech_support', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const payload = serializeProposalPortalForClient(portal, false)
    return NextResponse.json(payload)
  }

  const payload = serializeProposalPortalForClient(portal, true)
  if (!payload) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(payload)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json().catch(() => ({}))
    const portal = await updateProposalPortal(id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      recipe: typeof body.recipe === 'string' ? body.recipe : undefined,
      enabledModules: body.enabledModules,
      clientData: body.clientData,
      isPublic: typeof body.isPublic === 'boolean' ? body.isPublic : undefined,
    })

    if (!portal) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(portal)
  } catch (error) {
    console.error('[proposal-portals PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update portal' }, { status: 500 })
  }
}
