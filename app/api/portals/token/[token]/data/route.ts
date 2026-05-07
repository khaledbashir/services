export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getClientPortalPublicData } from '@/lib/client-portals'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const data = await getClientPortalPublicData(token)

    if (!data) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[portal token data GET] error:', error)
    return NextResponse.json({ error: 'Failed to load portal data' }, { status: 500 })
  }
}
