import { NextResponse } from 'next/server'
import { getLeaderboard, getFeed, getTeamStandings, seedBadges, awardPoints } from '@/lib/gamification'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'leaderboard'

  try {
    if (action === 'leaderboard') {
      const period = (url.searchParams.get('period') || 'week') as 'day' | 'week' | 'month' | 'all'
      const team = url.searchParams.get('team') || undefined
      const limit = parseInt(url.searchParams.get('limit') || '10')
      const data = await getLeaderboard(period, team, limit)
      return NextResponse.json({ data })
    }

    if (action === 'feed') {
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const data = await getFeed(limit)
      return NextResponse.json({ data })
    }

    if (action === 'team-standings') {
      const data = await getTeamStandings()
      return NextResponse.json({ data })
    }

    if (action === 'badges') {
      const { query } = await import('@/lib/db')
      const result = await query(`
        SELECT b.*, COUNT(ub.id) as earned_count
        FROM gamification_badges b
        LEFT JOIN gamification_user_badges ub ON b.id = ub.badge_id
        GROUP BY b.id
        ORDER BY b.tier, b.category, b.name
      `)
      return NextResponse.json({ data: result.rows })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Gamification API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'seed-badges') {
      await seedBadges()
      return NextResponse.json({ ok: true, message: 'Badges seeded' })
    }

    if (action === 'award') {
      const { staffId, staffName, actionType, metadata } = body
      if (!staffId || !staffName || !actionType) {
        return NextResponse.json({ error: 'staffId, staffName, actionType required' }, { status: 400 })
      }
      const result = await awardPoints(staffId, staffName, actionType, metadata || {})
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Gamification POST error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
