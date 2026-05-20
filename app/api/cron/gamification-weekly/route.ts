export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { postWeeklyLeaderboard } from '@/lib/gamification-slack'

export async function GET() {
  try {
    await postWeeklyLeaderboard()
    return NextResponse.json({ ok: true, posted: 'weekly-leaderboard' })
  } catch (err) {
    console.error('Gamification weekly cron error:', err)
    return NextResponse.json({ error: 'Failed to post weekly leaderboard' }, { status: 500 })
  }
}
