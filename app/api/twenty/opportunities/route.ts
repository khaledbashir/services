import { NextRequest, NextResponse } from 'next/server'
import { twentyClient } from '@/lib/twenty-client'

/**
 * GET /api/twenty/opportunities — List opportunities from Twenty CRM
 * Query params: ?bidStatus=WON&companyId=...
 */
export async function GET(request: NextRequest) {
  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const bidStatus = searchParams.get('bidStatus')
    const companyId = searchParams.get('companyId')

    let filter: string | undefined
    if (bidStatus) filter = `bidStatus[eq]:"${bidStatus}"`
    else if (companyId) filter = `companyId[eq]:"${companyId}"`

    const opportunities = await twentyClient.getOpportunities(filter)

    return NextResponse.json({
      data: opportunities,
      totalCount: opportunities.length,
    })
  } catch (err) {
    console.error('Twenty opportunities fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch opportunities' },
      { status: 500 }
    )
  }
}
