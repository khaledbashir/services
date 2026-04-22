import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { revokeClientPortal } from '@/lib/client-portals'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const { id } = await params
    const revoked = await revokeClientPortal(id)

    if (!revoked) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 })
    }

    return NextResponse.json({ portal: revoked })
  } catch (error) {
    console.error('[portals revoke] error:', error)
    return NextResponse.json({ error: 'Failed to revoke client portal' }, { status: 500 })
  }
}
