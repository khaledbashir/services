import { sendSlackMessage } from './slack'
import { getLeaderboard, getTeamStandings, type Badge, type StreakInfo } from './gamification'
import { dashboardUrl } from './app-url'

const CHANNEL = () => process.env.SLACK_GAMIFICATION_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || ''
const DASHBOARD_URL = dashboardUrl('/gamification')

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
}

const TEAM_EMOJI: Record<string, string> = {
  field_ops: '🏟️',
  design: '🎨',
  support: '🛠️',
}

const TEAM_LABEL: Record<string, string> = {
  field_ops: 'Field Ops',
  design: 'Design',
  support: 'Support',
}

const STREAK_MILESTONES = [5, 10, 25, 50, 100]

export async function notifyBadgeEarned(
  staffName: string,
  team: string,
  badge: Badge,
  actionType: string
): Promise<void> {
  const ch = CHANNEL()
  if (!ch) return

  const tierEmoji = TIER_EMOJI[badge.tier] || '🏅'
  const teamEmoji = TEAM_EMOJI[team] || ''
  const actionLabel = actionType.replace(/_/g, ' ').toLowerCase()

  await sendSlackMessage({
    channel: ch,
    text: `${tierEmoji} ${staffName} earned the "${badge.display_name}" badge!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tierEmoji} *${staffName}* earned a new badge!\n\n*${badge.icon} ${badge.display_name}* (${badge.tier})\n${badge.description}\n\n${teamEmoji} ${TEAM_LABEL[team] || team} · Triggered by: _${actionLabel}_`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🏆 View Leaderboard' },
            url: DASHBOARD_URL,
          },
        ],
      },
    ],
  })
}

export async function notifyStreakMilestone(
  staffName: string,
  team: string,
  streak: StreakInfo
): Promise<void> {
  if (!STREAK_MILESTONES.includes(streak.current_count)) return

  const ch = CHANNEL()
  if (!ch) return

  const fire = '🔥'.repeat(Math.min(streak.current_count / 5, 5))
  const teamEmoji = TEAM_EMOJI[team] || ''

  await sendSlackMessage({
    channel: ch,
    text: `${fire} ${staffName} hit a ${streak.current_count}-day streak!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${fire} *${staffName}* is on a *${streak.current_count}-day streak!*\n\nStreak type: _${streak.streak_type.replace(/_/g, ' ')}_\n${teamEmoji} ${TEAM_LABEL[team] || team}${streak.is_new_best ? '\n\n⭐ *New personal best!*' : ''}`,
        },
      },
    ],
  })
}

export async function postWeeklyLeaderboard(): Promise<void> {
  const ch = CHANNEL()
  if (!ch) return

  const teams = ['field_ops', 'design', 'support']
  const sections: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🏆 Weekly Leaderboard' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Top performers this week* — <${DASHBOARD_URL}|View Full Leaderboard>` },
    },
    { type: 'divider' },
  ]

  for (const team of teams) {
    const leaders = await getLeaderboard('week', team, 5)
    if (leaders.length === 0) continue

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
    const lines = leaders.map((l, i) =>
      `${medals[i] || `${i + 1}.`} *${l.staff_name}* — ${l.points} pts`
    ).join('\n')

    sections.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${TEAM_EMOJI[team] || ''} *${TEAM_LABEL[team] || team}*\n${lines}`,
      },
    })
  }

  const standings = await getTeamStandings()
  if (standings.length > 0) {
    sections.push({ type: 'divider' })
    const standingLines = standings.map((s, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'
      return `${medal} *${TEAM_LABEL[s.team] || s.team}* — ${s.total_points} pts (MVP: ${s.top_performer})`
    }).join('\n')
    sections.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Team Standings*\n${standingLines}` },
    })
  }

  await sendSlackMessage({
    channel: ch,
    text: '🏆 Weekly Leaderboard is here!',
    blocks: sections,
  })
}

export async function postMonthlyMVP(): Promise<void> {
  const ch = CHANNEL()
  if (!ch) return

  const teams = ['field_ops', 'design', 'support']
  const sections: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🌟 Monthly MVPs' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Top performers last month* — <${DASHBOARD_URL}|View Full Leaderboard>` },
    },
    { type: 'divider' },
  ]

  for (const team of teams) {
    const leaders = await getLeaderboard('month', team, 1)
    if (leaders.length === 0) continue

    sections.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${TEAM_EMOJI[team] || ''} *${TEAM_LABEL[team] || team} MVP*\n🏆 *${leaders[0].staff_name}* — ${leaders[0].points} pts`,
      },
    })
  }

  await sendSlackMessage({
    channel: ch,
    text: '🌟 Monthly MVPs announced!',
    blocks: sections,
  })
}

export async function notifyTeamAchievement(
  team: string,
  totalPoints: number,
  target: number
): Promise<void> {
  const ch = CHANNEL()
  if (!ch) return

  await sendSlackMessage({
    channel: ch,
    text: `🎯 ${TEAM_LABEL[team] || team} hit their weekly target!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🎯 *${TEAM_EMOJI[team] || ''} ${TEAM_LABEL[team] || team} hit their weekly target!*\n\n${totalPoints} / ${target} points this week\n\n<${DASHBOARD_URL}|View Leaderboard>`,
        },
      },
    ],
  })
}
