export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { postMonthlyMVP } from '@/lib/gamification-slack'

export async function GET() {
  try {
    await postMonthlyMVP()
    return NextResponse.json({ ok: true, posted: 'monthly-mvp' })
  } catch (err) {
    console.error('Gamification monthly cron error:', err)
    return NextResponse.json({ error: 'Failed to post monthly MVP' }, { status: 500 })
  }
}
