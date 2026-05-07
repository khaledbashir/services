export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { twentyClient } from '@/lib/twenty-client'

/**
 * GET /api/twenty/services — List services from Twenty CRM
 * Query params: ?venueId=...&serviceStatus=ACTIVE
 */
export async function GET(request: NextRequest) {
  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const serviceStatus = searchParams.get('serviceStatus')

    let filter: string | undefined
    if (venueId) filter = `venueId[eq]:"${venueId}"`
    else if (serviceStatus) filter = `serviceStatus[eq]:"${serviceStatus}"`

    const services = await twentyClient.getServices(filter)

    return NextResponse.json({
      data: services,
      totalCount: services.length,
    })
  } catch (err) {
    console.error('Twenty services fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch services' },
      { status: 500 }
    )
  }
}
