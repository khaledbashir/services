export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listComposeRuns } from '@/lib/marketing/compose-runs'

export async function GET() {
  try {
    const runs = await listComposeRuns(50)
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('compose runs list failed:', err)
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 })
  }
}
