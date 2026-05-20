import { query } from './db'

export const POINT_VALUES: Record<string, number> = {
  WALKTHROUGH_COMPLETED: 10,
  TICKET_RESOLVED: 15,
  TICKET_SLA_MET: 5,
  DESIGN_COMPLETED: 20,
  DESIGN_UNDER_BUDGET: 10,
  CHECKIN_ON_TIME: 5,
  GAME_READY: 5,
  POST_GAME_REPORT: 10,
  FULL_WORKFLOW: 15,
  CHECKLIST_ON_TIME: 10,
  PARTS_ORDER_FULFILLED: 10,
  RMA_CLOSED: 15,
}

export const TEAMS: Record<string, string[]> = {
  field_ops: ['Nick Delia', 'Herve Kasanda', 'David Cordon', 'Giancarlo Cordon', 'Gianni Strano'],
  design: ['Alexis Ventarola', 'Brittany Moore', 'Kirsten Park', 'Tony Russo', 'Daniel Croci'],
  support: ['Chris DeBernardis', 'Steve Sands', 'Steve Solomson', 'Stevie Dohm', 'Jeremy Riley'],
}

function getTeam(staffName: string): string {
  for (const [team, members] of Object.entries(TEAMS)) {
    if (members.includes(staffName)) return team
  }
  return 'general'
}

export async function awardPoints(
  staffId: string,
  staffName: string,
  actionType: string,
  metadata: Record<string, unknown> = {}
): Promise<{ points: number; newBadges: Badge[]; streakUpdate: StreakInfo | null }> {
  const points = POINT_VALUES[actionType]
  if (!points) throw new Error(`Unknown action type: ${actionType}`)

  const team = getTeam(staffName)

  await query(
    `INSERT INTO gamification_points (staff_id, staff_name, team, action_type, points, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [staffId, staffName, team, actionType, points, JSON.stringify(metadata)]
  )

  const streakUpdate = await updateStreak(staffId, actionType)
  const newBadges = await checkBadges(staffId, staffName)

  return { points, newBadges, streakUpdate }
}

export interface Badge {
  id: string
  name: string
  display_name: string
  description: string
  icon: string
  tier: string
  category: string
}

export interface StreakInfo {
  streak_type: string
  current_count: number
  best_count: number
  is_new_best: boolean
}

export async function updateStreak(staffId: string, actionType: string): Promise<StreakInfo | null> {
  const streakType = actionType.includes('CHECKIN') || actionType.includes('GAME_READY') || actionType.includes('POST_GAME')
    ? 'daily_workflow'
    : actionType.includes('TICKET') ? 'ticket_resolution'
    : actionType.includes('DESIGN') ? 'design_completion'
    : actionType.includes('WALKTHROUGH') ? 'walkthrough'
    : 'general'

  const existing = await query(
    `SELECT * FROM gamification_streaks WHERE staff_id = $1 AND streak_type = $2`,
    [staffId, streakType]
  )

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000) // 36hr grace

  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO gamification_streaks (staff_id, streak_type, current_count, best_count, last_activity_at, started_at)
       VALUES ($1, $2, 1, 1, NOW(), NOW())`,
      [staffId, streakType]
    )
    return { streak_type: streakType, current_count: 1, best_count: 1, is_new_best: true }
  }

  const streak = existing.rows[0]
  const lastActivity = new Date(streak.last_activity_at)
  const sameDay = lastActivity.toDateString() === now.toDateString()

  if (sameDay) return null

  const withinGrace = lastActivity >= oneDayAgo
  const newCount = withinGrace ? streak.current_count + 1 : 1
  const newBest = Math.max(streak.best_count, newCount)
  const isNewBest = newCount > streak.best_count

  await query(
    `UPDATE gamification_streaks
     SET current_count = $1, best_count = $2, last_activity_at = NOW(),
         started_at = CASE WHEN $3 THEN started_at ELSE NOW() END
     WHERE staff_id = $4 AND streak_type = $5`,
    [newCount, newBest, withinGrace, staffId, streakType]
  )

  return { streak_type: streakType, current_count: newCount, best_count: newBest, is_new_best: isNewBest }
}

export async function checkBadges(staffId: string, staffName: string): Promise<Badge[]> {
  const badges = await query(`SELECT * FROM gamification_badges`)
  const earned = await query(
    `SELECT badge_id FROM gamification_user_badges WHERE staff_id = $1`,
    [staffId]
  )
  const earnedIds = new Set(earned.rows.map((r: { badge_id: string }) => r.badge_id))

  const stats = await getStaffStats(staffId)
  const newBadges: Badge[] = []

  for (const badge of badges.rows) {
    if (earnedIds.has(badge.id)) continue
    if (evaluateCriteria(badge.criteria, stats)) {
      await query(
        `INSERT INTO gamification_user_badges (staff_id, badge_id, context)
         VALUES ($1, $2, $3)
         ON CONFLICT (staff_id, badge_id) DO NOTHING`,
        [staffId, badge.id, JSON.stringify({ staff_name: staffName, stats })]
      )
      newBadges.push(badge)
    }
  }

  return newBadges
}

interface StaffStats {
  total_points: number
  total_actions: number
  action_counts: Record<string, number>
  best_streak: number
  current_streaks: Record<string, number>
  days_active: number
}

async function getStaffStats(staffId: string): Promise<StaffStats> {
  const pointsResult = await query(
    `SELECT COALESCE(SUM(points), 0) as total_points, COUNT(*) as total_actions
     FROM gamification_points WHERE staff_id = $1`,
    [staffId]
  )

  const actionCounts = await query(
    `SELECT action_type, COUNT(*) as cnt
     FROM gamification_points WHERE staff_id = $1
     GROUP BY action_type`,
    [staffId]
  )

  const streaks = await query(
    `SELECT streak_type, current_count, best_count
     FROM gamification_streaks WHERE staff_id = $1`,
    [staffId]
  )

  const daysActive = await query(
    `SELECT COUNT(DISTINCT DATE(earned_at)) as days
     FROM gamification_points WHERE staff_id = $1`,
    [staffId]
  )

  const counts: Record<string, number> = {}
  for (const row of actionCounts.rows) counts[row.action_type] = parseInt(row.cnt)

  const currentStreaks: Record<string, number> = {}
  let bestStreak = 0
  for (const row of streaks.rows) {
    currentStreaks[row.streak_type] = row.current_count
    bestStreak = Math.max(bestStreak, row.best_count)
  }

  return {
    total_points: parseInt(pointsResult.rows[0].total_points),
    total_actions: parseInt(pointsResult.rows[0].total_actions),
    action_counts: counts,
    best_streak: bestStreak,
    current_streaks: currentStreaks,
    days_active: parseInt(daysActive.rows[0].days),
  }
}

function evaluateCriteria(criteria: Record<string, unknown>, stats: StaffStats): boolean {
  if (criteria.min_total_points && stats.total_points < (criteria.min_total_points as number)) return false
  if (criteria.min_total_actions && stats.total_actions < (criteria.min_total_actions as number)) return false
  if (criteria.min_streak && stats.best_streak < (criteria.min_streak as number)) return false
  if (criteria.min_days_active && stats.days_active < (criteria.min_days_active as number)) return false

  if (criteria.min_action_count) {
    const req = criteria.min_action_count as Record<string, number>
    for (const [action, min] of Object.entries(req)) {
      if ((stats.action_counts[action] || 0) < min) return false
    }
  }

  return true
}

export async function getLeaderboard(
  period: 'day' | 'week' | 'month' | 'all' = 'week',
  team?: string,
  limit: number = 10
): Promise<Array<{ rank: number; staff_id: string; staff_name: string; team: string; points: number }>> {
  const periodFilter = period === 'all' ? '' :
    period === 'day' ? `AND earned_at >= NOW() - INTERVAL '1 day'` :
    period === 'week' ? `AND earned_at >= NOW() - INTERVAL '7 days'` :
    `AND earned_at >= NOW() - INTERVAL '30 days'`

  const teamFilter = team ? `AND team = '${team}'` : ''

  const result = await query(`
    SELECT staff_id, staff_name, team, SUM(points) as total_points
    FROM gamification_points
    WHERE 1=1 ${periodFilter} ${teamFilter}
    GROUP BY staff_id, staff_name, team
    ORDER BY total_points DESC
    LIMIT $1
  `, [limit])

  return result.rows.map((row: { staff_id: string; staff_name: string; team: string; total_points: string }, i: number) => ({
    rank: i + 1,
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    team: row.team,
    points: parseInt(row.total_points),
  }))
}

export async function getProfile(staffId: string): Promise<{
  staff_id: string
  total_points: number
  rank: number
  badges: Badge[]
  streaks: Array<{ type: string; current: number; best: number }>
  recent_activity: Array<{ action_type: string; points: number; earned_at: string }>
}> {
  const stats = await getStaffStats(staffId)

  const rankResult = await query(`
    SELECT COUNT(*) + 1 as rank FROM (
      SELECT staff_id, SUM(points) as tp
      FROM gamification_points
      WHERE earned_at >= NOW() - INTERVAL '7 days'
      GROUP BY staff_id
    ) sub
    WHERE tp > (
      SELECT COALESCE(SUM(points), 0)
      FROM gamification_points
      WHERE staff_id = $1 AND earned_at >= NOW() - INTERVAL '7 days'
    )
  `, [staffId])

  const badges = await query(`
    SELECT b.* FROM gamification_badges b
    JOIN gamification_user_badges ub ON b.id = ub.badge_id
    WHERE ub.staff_id = $1
    ORDER BY ub.earned_at DESC
  `, [staffId])

  const streaks = await query(
    `SELECT streak_type, current_count, best_count FROM gamification_streaks WHERE staff_id = $1`,
    [staffId]
  )

  const recent = await query(
    `SELECT action_type, points, earned_at FROM gamification_points
     WHERE staff_id = $1 ORDER BY earned_at DESC LIMIT 10`,
    [staffId]
  )

  return {
    staff_id: staffId,
    total_points: stats.total_points,
    rank: parseInt(rankResult.rows[0].rank),
    badges: badges.rows,
    streaks: streaks.rows.map((r: { streak_type: string; current_count: number; best_count: number }) => ({
      type: r.streak_type, current: r.current_count, best: r.best_count
    })),
    recent_activity: recent.rows,
  }
}

export async function getFeed(limit: number = 20): Promise<Array<{
  staff_name: string
  team: string
  action_type: string
  points: number
  earned_at: string
}>> {
  const result = await query(`
    SELECT staff_name, team, action_type, points, earned_at
    FROM gamification_points
    ORDER BY earned_at DESC
    LIMIT $1
  `, [limit])
  return result.rows
}

export async function getTeamStandings(): Promise<Array<{
  team: string
  total_points: number
  member_count: number
  avg_points: number
  top_performer: string
}>> {
  const result = await query(`
    WITH team_stats AS (
      SELECT team, SUM(points) as total_points, COUNT(DISTINCT staff_id) as member_count,
             ROUND(AVG(points)::numeric, 1) as avg_points
      FROM gamification_points
      WHERE earned_at >= NOW() - INTERVAL '7 days'
      GROUP BY team
    ),
    top_performers AS (
      SELECT DISTINCT ON (team) team, staff_name
      FROM gamification_points
      WHERE earned_at >= NOW() - INTERVAL '7 days'
      GROUP BY team, staff_id, staff_name
      ORDER BY team, SUM(points) DESC
    )
    SELECT ts.team, ts.total_points, ts.member_count, ts.avg_points, COALESCE(tp.staff_name, '') as top_performer
    FROM team_stats ts
    LEFT JOIN top_performers tp ON ts.team = tp.team
    ORDER BY ts.total_points DESC
  `)
  return result.rows.map((r: { team: string; total_points: string; member_count: string; avg_points: string; top_performer: string }) => ({
    team: r.team,
    total_points: parseInt(r.total_points),
    member_count: parseInt(r.member_count),
    avg_points: parseFloat(r.avg_points),
    top_performer: r.top_performer,
  }))
}

export async function seedBadges(): Promise<void> {
  const badges = [
    // Streak badges
    { name: 'iron_will', display_name: 'Iron Will', description: '5-day activity streak', icon: '💪', tier: 'bronze', category: 'streak', criteria: { min_streak: 5 } },
    { name: 'unstoppable', display_name: 'Unstoppable', description: '10-day activity streak', icon: '🔥', tier: 'silver', category: 'streak', criteria: { min_streak: 10 } },
    { name: 'legend', display_name: 'Legend', description: '25-day activity streak', icon: '⭐', tier: 'gold', category: 'streak', criteria: { min_streak: 25 } },
    { name: 'immortal', display_name: 'Immortal', description: '50-day activity streak', icon: '👑', tier: 'platinum', category: 'streak', criteria: { min_streak: 50 } },

    // Volume badges
    { name: 'first_blood', display_name: 'First Blood', description: 'Complete your first action', icon: '🎯', tier: 'bronze', category: 'volume', criteria: { min_total_actions: 1 } },
    { name: 'double_digit', display_name: 'Double Digit', description: '10 total actions', icon: '🔟', tier: 'bronze', category: 'volume', criteria: { min_total_actions: 10 } },
    { name: 'half_century', display_name: 'Half Century', description: '50 total actions', icon: '🏅', tier: 'silver', category: 'volume', criteria: { min_total_actions: 50 } },
    { name: 'centurion', display_name: 'Centurion', description: '100 total actions', icon: '💯', tier: 'gold', category: 'volume', criteria: { min_total_actions: 100 } },
    { name: 'elite', display_name: 'Elite', description: '500 total actions', icon: '🏆', tier: 'platinum', category: 'volume', criteria: { min_total_actions: 500 } },

    // Points badges
    { name: 'rising_star', display_name: 'Rising Star', description: 'Earn 100 points', icon: '🌟', tier: 'bronze', category: 'points', criteria: { min_total_points: 100 } },
    { name: 'powerhouse', display_name: 'Powerhouse', description: 'Earn 500 points', icon: '⚡', tier: 'silver', category: 'points', criteria: { min_total_points: 500 } },
    { name: 'mvp', display_name: 'MVP', description: 'Earn 1000 points', icon: '🌠', tier: 'gold', category: 'points', criteria: { min_total_points: 1000 } },
    { name: 'hall_of_fame', display_name: 'Hall of Fame', description: 'Earn 5000 points', icon: '🏛️', tier: 'platinum', category: 'points', criteria: { min_total_points: 5000 } },

    // Specialist badges
    { name: 'walkthrough_warrior', display_name: 'Walkthrough Warrior', description: '25 walkthroughs completed', icon: '🚶', tier: 'silver', category: 'specialist', criteria: { min_action_count: { WALKTHROUGH_COMPLETED: 25 } } },
    { name: 'ticket_terminator', display_name: 'Ticket Terminator', description: '25 tickets resolved', icon: '🎫', tier: 'silver', category: 'specialist', criteria: { min_action_count: { TICKET_RESOLVED: 25 } } },
    { name: 'design_master', display_name: 'Design Master', description: '25 designs completed', icon: '🎨', tier: 'silver', category: 'specialist', criteria: { min_action_count: { DESIGN_COMPLETED: 25 } } },
    { name: 'sla_champion', display_name: 'SLA Champion', description: '10 tickets resolved within SLA', icon: '⏱️', tier: 'gold', category: 'specialist', criteria: { min_action_count: { TICKET_SLA_MET: 10 } } },

    // Consistency badges
    { name: 'regular', display_name: 'Regular', description: 'Active for 7 days', icon: '📅', tier: 'bronze', category: 'consistency', criteria: { min_days_active: 7 } },
    { name: 'dedicated', display_name: 'Dedicated', description: 'Active for 30 days', icon: '📆', tier: 'silver', category: 'consistency', criteria: { min_days_active: 30 } },
    { name: 'committed', display_name: 'Committed', description: 'Active for 90 days', icon: '🗓️', tier: 'gold', category: 'consistency', criteria: { min_days_active: 90 } },
  ]

  for (const badge of badges) {
    await query(
      `INSERT INTO gamification_badges (name, display_name, description, icon, tier, category, criteria)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         tier = EXCLUDED.tier,
         category = EXCLUDED.category,
         criteria = EXCLUDED.criteria`,
      [badge.name, badge.display_name, badge.description, badge.icon, badge.tier, badge.category, JSON.stringify(badge.criteria)]
    )
  }
}
