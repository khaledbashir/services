import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { POINT_VALUES, TEAMS, seedBadges } from '@/lib/gamification'

const STAFF = [
  { id: '635b330b', name: 'Nick Delia', team: 'field_ops' },
  { id: '60ea5ba1', name: 'Herve Kasanda', team: 'field_ops' },
  { id: '40560f6b', name: 'David Cordon', team: 'field_ops' },
  { id: 'f8cc3b70', name: 'Giancarlo Cordon', team: 'field_ops' },
  { id: '8e7d9413', name: 'Gianni Strano', team: 'field_ops' },
  { id: '6df58325', name: 'Alexis Ventarola', team: 'design' },
  { id: 'a677cdee', name: 'Brittany Moore', team: 'design' },
  { id: '8fa05dd3', name: 'Kirsten Park', team: 'design' },
  { id: 'cd4dc5f1', name: 'Tony Russo', team: 'design' },
  { id: 'a2c8b471', name: 'Daniel Croci', team: 'design' },
  { id: '835baf30', name: 'Chris DeBernardis', team: 'support' },
  { id: '4aa577d5', name: 'Steve Sands', team: 'support' },
  { id: 'de6df620', name: 'Steve Solomson', team: 'support' },
  { id: '2e654b1a', name: 'Stevie Dohm', team: 'support' },
  { id: 'dad19008', name: 'Jeremy Riley', team: 'support' },
]

const TEAM_ACTIONS: Record<string, string[]> = {
  field_ops: ['WALKTHROUGH_COMPLETED', 'CHECKIN_ON_TIME', 'GAME_READY', 'POST_GAME_REPORT', 'FULL_WORKFLOW', 'CHECKLIST_ON_TIME', 'PARTS_ORDER_FULFILLED'],
  design: ['DESIGN_COMPLETED', 'DESIGN_UNDER_BUDGET', 'CHECKIN_ON_TIME', 'GAME_READY'],
  support: ['TICKET_RESOLVED', 'TICKET_SLA_MET', 'RMA_CLOSED', 'PARTS_ORDER_FULFILLED'],
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export async function POST() {
  try {
    await query(`DELETE FROM gamification_user_badges`)
    await query(`DELETE FROM gamification_streaks`)
    await query(`DELETE FROM gamification_points`)
    await query(`DELETE FROM gamification_leaderboard_snapshots`)

    await seedBadges()

    let totalPoints = 0
    const now = Date.now()

    for (const staff of STAFF) {
      const actions = TEAM_ACTIONS[staff.team] || ['CHECKIN_ON_TIME']
      const activityLevel = randomInt(3, 8)

      for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
        if (Math.random() > 0.7 + (activityLevel * 0.03)) continue

        const actionsToday = randomInt(1, activityLevel)
        for (let a = 0; a < actionsToday; a++) {
          const actionType = actions[randomInt(0, actions.length - 1)]
          const points = POINT_VALUES[actionType] || 5
          const earnedAt = new Date(now - daysAgo * 86400000 + randomInt(0, 86400000))

          await query(
            `INSERT INTO gamification_points (staff_id, staff_name, team, action_type, points, metadata, earned_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [staff.id, staff.name, staff.team, actionType, points, '{}', earnedAt.toISOString()]
          )
          totalPoints += points
        }
      }

      const streakTypes = ['daily_workflow', 'general']
      for (const st of streakTypes) {
        const current = randomInt(1, 12)
        const best = randomInt(current, current + 10)
        await query(
          `INSERT INTO gamification_streaks (staff_id, streak_type, current_count, best_count, last_activity_at, started_at)
           VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour', NOW() - ($3 || ' days')::INTERVAL)
           ON CONFLICT (staff_id, streak_type) DO UPDATE SET
             current_count = EXCLUDED.current_count,
             best_count = EXCLUDED.best_count,
             last_activity_at = EXCLUDED.last_activity_at`,
          [staff.id, st, current, best]
        )
      }
    }

    // Run badge checks for everyone
    const badges = await query(`SELECT * FROM gamification_badges`)
    for (const staff of STAFF) {
      const stats = await query(`
        SELECT COALESCE(SUM(points), 0) as total_points, COUNT(*) as total_actions
        FROM gamification_points WHERE staff_id = $1
      `, [staff.id])

      const actionCounts = await query(`
        SELECT action_type, COUNT(*) as cnt
        FROM gamification_points WHERE staff_id = $1 GROUP BY action_type
      `, [staff.id])

      const daysActive = await query(`
        SELECT COUNT(DISTINCT DATE(earned_at)) as days
        FROM gamification_points WHERE staff_id = $1
      `, [staff.id])

      const streakBest = await query(`
        SELECT COALESCE(MAX(best_count), 0) as best FROM gamification_streaks WHERE staff_id = $1
      `, [staff.id])

      const tp = parseInt(stats.rows[0].total_points)
      const ta = parseInt(stats.rows[0].total_actions)
      const da = parseInt(daysActive.rows[0].days)
      const bs = parseInt(streakBest.rows[0].best)
      const ac: Record<string, number> = {}
      for (const r of actionCounts.rows) ac[r.action_type] = parseInt(r.cnt)

      for (const badge of badges.rows) {
        const c = badge.criteria
        let earned = true
        if (c.min_total_points && tp < c.min_total_points) earned = false
        if (c.min_total_actions && ta < c.min_total_actions) earned = false
        if (c.min_streak && bs < c.min_streak) earned = false
        if (c.min_days_active && da < c.min_days_active) earned = false
        if (c.min_action_count) {
          for (const [act, min] of Object.entries(c.min_action_count as Record<string, number>)) {
            if ((ac[act] || 0) < min) earned = false
          }
        }
        if (earned) {
          await query(
            `INSERT INTO gamification_user_badges (staff_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [staff.id, badge.id]
          )
        }
      }
    }

    const pointCount = await query(`SELECT COUNT(*) as c FROM gamification_points`)
    const badgeCount = await query(`SELECT COUNT(*) as c FROM gamification_user_badges`)

    return NextResponse.json({
      ok: true,
      message: 'Gamification data seeded',
      stats: {
        staff: STAFF.length,
        total_point_events: parseInt(pointCount.rows[0].c),
        total_points: totalPoints,
        badges_earned: parseInt(badgeCount.rows[0].c),
      }
    })
  } catch (err) {
    console.error('Seed error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
