export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 90

import { NextRequest, NextResponse } from 'next/server'
import { generateAdCopy } from '@/lib/marketing/ad-creative'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const brief = String(body.brief || '').trim()
    if (!brief) {
      return NextResponse.json({ error: 'Brief is required' }, { status: 400 })
    }
    const copy = await generateAdCopy({
      brief: brief.slice(0, 2000),
      venue: body.venue ? String(body.venue).slice(0, 200) : undefined,
    })
    return NextResponse.json({ copy })
  } catch (err) {
    console.error('Ad copy generation failed:', err)
    return NextResponse.json({ error: 'Copy generation failed' }, { status: 500 })
  }
}
