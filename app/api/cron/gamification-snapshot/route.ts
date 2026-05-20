export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getLeaderboard, getTeamStandings } from '@/lib/gamification'

export async function GET() {
  try {
    const periods: Array<'day' | 'week' | 'month'> = ['day', 'week', 'month']
    const teams = ['field_ops', 'design', 'support']

    for (const period of periods) {
      const overall = await getLeaderboard(period, undefined, 20)
      await query(
        `INSERT INTO gamification_leaderboard_snapshots (period, team, rankings, snapshot_at)
         VALUES ($1, $2, $3, NOW())`,
        [period, 'all', JSON.stringify(overall)]
      )

      for (const team of teams) {
        const teamBoard = await getLeaderboard(period, team, 10)
        await query(
          `INSERT INTO gamification_leaderboard_snapshots (period, team, rankings, snapshot_at)
           VALUES ($1, $2, $3, NOW())`,
          [period, team, JSON.stringify(teamBoard)]
        )
      }
    }

    const standings = await getTeamStandings()
    await query(
      `INSERT INTO gamification_leaderboard_snapshots (period, team, rankings, snapshot_at)
       VALUES ($1, $2, $3, NOW())`,
      ['week', 'standings', JSON.stringify(standings)]
    )

    return NextResponse.json({ ok: true, snapshots: periods.length * (teams.length + 1) + 1 })
  } catch (err) {
    console.error('Gamification snapshot cron error:', err)
    return NextResponse.json({ error: 'Failed to create snapshots' }, { status: 500 })
  }
}
