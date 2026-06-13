export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { loadMarketingComposeContext } from '@/lib/marketing/compose-context'

export async function GET() {
  try {
    const context = await loadMarketingComposeContext()
    return NextResponse.json(context)
  } catch (err) {
    console.error('marketing compose context:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
