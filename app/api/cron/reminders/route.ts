export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, sendSlackMessageDetailed } from '@/lib/slack'
import { ensureWorkflowReminderTracking, recordPostGameReminder } from '@/lib/workflow-reminder-cleanup'
import { dashboardUrl as buildDashboardUrl } from '@/lib/app-url'

// Called every 15 min by EasyPanel cron or external scheduler
// Sends reminders to techs who haven't checked in before their events
//
// Scheduler setup (EasyPanel or system cron):
//   */15 * * * * curl -s https://services.ancsports.net/api/cron/reminders

const DEDUP_WINDOW_MS = 2 * 3600000 // 2 hours — don't re-remind within this window

// Slack `<@U…>` pings the user; plain text doesn't. Falls back to the name when no Slack ID is on file.
function staffMention(fullName: string, slackUserIds: string[] | null | undefined): string {
  const id = (slackUserIds || []).find((v) => typeof v === 'string' && v.trim().length > 0)
  return id ? `<@${id}>` : fullName
}

export async function GET() {
  try {
    await ensureWorkflowReminderTracking()

    // Check if tech-reminders automation is enabled
    const jobResult = await query(`SELECT enabled FROM automation_jobs WHERE id = 'tech-reminders'`)
    if (jobResult.rows.length > 0 && !jobResult.rows[0].enabled) {
      return NextResponse.json({ ok: true, message: 'Tech reminders are disabled', reminders: { tier1: 0, tier2: 0, tier3: 0 }, skipped: { tier1: 0, tier2: 0, tier3: 0 } })
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_MS).toISOString()

    // TIER 1: 3 hours before — friendly reminder to the tech (per tech/event)
    const threeHoursFromNow = new Date(now.getTime() + 3 * 3600000)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 3600000)

    const tier1Result = await query(
      `SELECT e.id as event_id, e.summary, e.start_time,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              s.id as staff_id, s.full_name, s.email, s.slack_user_ids,
              ea.id as assignment_id, ea.last_reminder_sent_at
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time > $2
         AND e.start_time <= $3
         AND COALESCE(e.approval_status, 'approved') = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )`,
      [today, twoHoursFromNow.toISOString(), threeHoursFromNow.toISOString()]
    )

    let tier1Sent = 0
    let tier1Skipped = 0
    for (const row of tier1Result.rows) {
      // Dedup: skip if already reminded within window
      if (row.last_reminder_sent_at && new Date(row.last_reminder_sent_at) > new Date(dedupCutoff)) {
        tier1Skipped++
        continue
      }

      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      const workflowUrl = buildDashboardUrl(`/workflow/${row.event_id}`)
      const sent = await sendSlackMessage({
        channel,
        text: `Reminder: ${row.full_name} — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              // Inline mrkdwn link stays clickable for every reader — a Slack
              // URL-button gets replaced by "selected by @user" for everyone
              // else as soon as anyone clicks, which looked to Joe like the
              // link was disappearing.
              text: `👋 *Reminder for ${staffMention(row.full_name, row.slack_user_ids)}*\n\nYou're assigned to *${row.summary}* at *${row.venue_name}* tonight at *${row.start_time_et} ET*.\n\nPlease check in when you arrive on site.\n\n📋 <${workflowUrl}|Open Workflow>`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📋 Open Workflow' },
                url: workflowUrl,
              },
            ],
          },
        ],
      })

      if (sent) {
        await query(`UPDATE event_assignments SET last_reminder_sent_at = NOW() WHERE id = $1`, [row.assignment_id])
        tier1Sent++
      }
    }

    // TIER 2: 1 hour before — escalation to managers (per event)
    const oneHourFromNow = new Date(now.getTime() + 1 * 3600000)

    const tier2Result = await query(
      `SELECT e.id as event_id, e.summary, e.last_escalation_sent_at,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              json_agg(json_build_object('name', s.full_name, 'slack_ids', s.slack_user_ids)) as missing_staff,
              count(s.id) as missing_count
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time > NOW()
         AND e.start_time <= $2
         AND COALESCE(e.approval_status, 'approved') = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )
       GROUP BY e.id, e.summary, e.start_time, e.last_escalation_sent_at, v.name, v.slack_channel_id`,
      [today, oneHourFromNow.toISOString()]
    )

    let tier2Sent = 0
    let tier2Skipped = 0
    for (const row of tier2Result.rows) {
      // Dedup: skip if already escalated within window
      if (row.last_escalation_sent_at && new Date(row.last_escalation_sent_at) > new Date(dedupCutoff)) {
        tier2Skipped++
        continue
      }

      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      const missingMentions = (row.missing_staff || [])
        .map((m: { name: string; slack_ids: string[] | null }) => staffMention(m.name, m.slack_ids))
        .join(', ')
      const sent = await sendSlackMessage({
        channel,
        text: `🚨 ESCALATION: ${row.missing_count} tech(s) not checked in — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *ESCALATION — No Check-in*\n\n*${row.summary}* at *${row.venue_name}* starts at *${row.start_time_et} ET* — that's less than 1 hour away.\n\n*Missing check-in from:* ${missingMentions}\n\n_This requires manager attention._`,
            },
          },
        ],
      })

      if (sent) {
        await query(`UPDATE events SET last_escalation_sent_at = NOW() WHERE id = $1`, [row.event_id])
        tier2Sent++
      }
    }

    // TIER 3: Events already started — still no check-in (post-start alert, per event)
    const tier3Result = await query(
      `SELECT e.id as event_id, e.summary, e.last_escalation_sent_at,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              json_agg(json_build_object('name', s.full_name, 'slack_ids', s.slack_user_ids)) as missing_staff,
              count(s.id) as missing_count
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time <= NOW()
         AND e.start_time > NOW() - INTERVAL '2 hours'
         AND COALESCE(e.approval_status, 'approved') = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )
       GROUP BY e.id, e.summary, e.start_time, e.last_escalation_sent_at, v.name, v.slack_channel_id`,
      [today]
    )

    let tier3Sent = 0
    let tier3Skipped = 0
    for (const row of tier3Result.rows) {
      // Dedup: skip if already sent critical alert within window
      if (row.last_escalation_sent_at && new Date(row.last_escalation_sent_at) > new Date(dedupCutoff)) {
        tier3Skipped++
        continue
      }

      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      const missingMentions = (row.missing_staff || [])
        .map((m: { name: string; slack_ids: string[] | null }) => staffMention(m.name, m.slack_ids))
        .join(', ')
      const sent = await sendSlackMessage({
        channel,
        text: `🔴 CRITICAL: Game started, no check-in — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔴 *CRITICAL — Game Started, No Check-in*\n\n*${row.summary}* at *${row.venue_name}* started at *${row.start_time_et} ET* and nobody has checked in.\n\n*Missing:* ${missingMentions}\n\n_Immediate action required._`,
            },
          },
        ],
      })

      if (sent) {
        await query(`UPDATE events SET last_escalation_sent_at = NOW() WHERE id = $1`, [row.event_id])
        tier3Sent++
      }
    }

    // TIER 4: Game Ready not submitted — ping checked-in techs ~30 min before start.
    // Fires once per assignment, deduped via last_game_ready_reminder_at.
    const gameReadyWindow = new Date(now.getTime() + 30 * 60000)
    const tier4Result = await query(
      `SELECT e.id as event_id, e.summary,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              s.id as staff_id, s.full_name, s.slack_user_ids,
              ea.id as assignment_id, ea.last_game_ready_reminder_at
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.start_time > NOW()
         AND e.start_time <= $2
         AND COALESCE(e.approval_status, 'approved') = 'approved'
         AND EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'game_ready'
         )`,
      [today, gameReadyWindow.toISOString()]
    )

    let tier4Sent = 0
    let tier4Skipped = 0
    for (const row of tier4Result.rows) {
      if (row.last_game_ready_reminder_at && new Date(row.last_game_ready_reminder_at) > new Date(dedupCutoff)) {
        tier4Skipped++
        continue
      }
      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      const workflowUrl = buildDashboardUrl(`/workflow/${row.event_id}`)
      const sent = await sendSlackMessage({
        channel,
        text: `⏰ Game Ready check — ${row.full_name} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏰ *Game Ready check for ${staffMention(row.full_name, row.slack_user_ids)}*\n\n*${row.summary}* at *${row.venue_name}* starts at *${row.start_time_et} ET*.\n\nPlease submit your *Game Ready* confirmation (equipment check, crew ready, comms test).\n\n✅ <${workflowUrl}|Submit Game Ready>`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '✅ Submit Game Ready' },
                url: workflowUrl,
              },
            ],
          },
        ],
      })

      if (sent) {
        await query(`UPDATE event_assignments SET last_game_ready_reminder_at = NOW() WHERE id = $1`, [row.assignment_id])
        tier4Sent++
      }
    }

    // TIER 5: Post Game Ops Report not submitted — ping ~30 min after event end.
    // Windowed to 6h after end so we stop nagging overnight.
    const postGameStart = new Date(now.getTime() - 30 * 60000)
    const postGameEnd = new Date(now.getTime() - 6 * 3600000)
    const tier5Result = await query(
      `SELECT e.id as event_id, e.summary,
              TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as end_time_et,
              v.name as venue_name, v.slack_channel_id,
              s.id as staff_id, s.full_name, s.slack_user_ids,
              ea.id as assignment_id, ea.last_post_game_reminder_at
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.end_time <= $1
         AND e.end_time >= $2
         AND COALESCE(e.approval_status, 'approved') = 'approved'
         AND COALESCE(e.workflow_status, 'pending') <> 'post_game_submitted'
         AND EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id
             AND ws.type IN ('check_in', 'game_ready')
         )
         -- On an event set to "one report", the first submission closes it out
         -- for the whole crew and nobody else is chased. On "everyone", each
         -- assigned tech is chased until they have submitted their own
         -- (Charlie 2026-08-17).
         AND (
           COALESCE(e.post_game_report_mode, v.post_game_report_mode, 'one') = 'everyone'
           OR NOT EXISTS (
             SELECT 1 FROM workflow_submissions ws
             WHERE ws.event_id = e.id AND ws.type = 'post_game_report'
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'post_game_report'
         )`,
      [postGameStart.toISOString(), postGameEnd.toISOString()]
    )

    let tier5Sent = 0
    let tier5Skipped = 0
    for (const row of tier5Result.rows) {
      if (row.last_post_game_reminder_at && new Date(row.last_post_game_reminder_at) > new Date(dedupCutoff)) {
        tier5Skipped++
        continue
      }
      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      const workflowUrl = buildDashboardUrl(`/workflow/${row.event_id}`)
      const sent = await sendSlackMessageDetailed({
        channel,
        text: `📝 Post-Game report pending — ${row.full_name} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📝 *Post-Game Ops Report needed from ${staffMention(row.full_name, row.slack_user_ids)}*\n\n*${row.summary}* at *${row.venue_name}* ended at *${row.end_time_et} ET*.\n\nPlease submit the *Post-Game Ops Report* (notes + incidents) to close out the workflow.\n\n📝 <${workflowUrl}|Submit Post-Game>`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📝 Submit Post-Game' },
                url: workflowUrl,
              },
            ],
          },
        ],
      })

      if (sent.ok) {
        if (sent.ts && sent.channel) {
          await recordPostGameReminder(row.assignment_id, sent.channel, sent.ts)
        } else {
          await query(`UPDATE event_assignments SET last_post_game_reminder_at = NOW() WHERE id = $1`, [row.assignment_id])
        }
        tier5Sent++
      }
    }

    return NextResponse.json({
      ok: true,
      reminders: {
        tier1: tier1Sent, tier2: tier2Sent, tier3: tier3Sent,
        tier4_game_ready: tier4Sent, tier5_post_game: tier5Sent,
      },
      skipped: {
        tier1: tier1Skipped, tier2: tier2Skipped, tier3: tier3Skipped,
        tier4_game_ready: tier4Skipped, tier5_post_game: tier5Skipped,
      },
      message: `Sent ${tier1Sent} check-in reminders, ${tier2Sent} escalations, ${tier3Sent} critical, ${tier4Sent} game-ready, ${tier5Sent} post-game. Skipped ${tier1Skipped + tier2Skipped + tier3Skipped + tier4Skipped + tier5Skipped} (already notified).`,
    })
  } catch (err) {
    console.error('Error running reminders:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
