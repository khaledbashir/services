import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

// Called every 15-30 min by Claw cron or external scheduler
// Sends reminders to techs who haven't checked in before their events

export async function GET() {
  try {
    // Check if tech-reminders automation is enabled
    const jobResult = await query(`SELECT enabled FROM automation_jobs WHERE id = 'tech-reminders'`)
    if (jobResult.rows.length > 0 && !jobResult.rows[0].enabled) {
      return NextResponse.json({ ok: true, message: 'Tech reminders are disabled', reminders: { tier1: 0, tier2: 0, tier3: 0 } })
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // TIER 1: 3 hours before — friendly reminder to the tech
    const threeHoursFromNow = new Date(now.getTime() + 3 * 3600000)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 3600000)

    const tier1Result = await query(
      `SELECT e.id as event_id, e.summary, e.start_time,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              s.id as staff_id, s.full_name, s.email
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time > $2
         AND e.start_time <= $3
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )`,
      [today, twoHoursFromNow.toISOString(), threeHoursFromNow.toISOString()]
    )

    let tier1Sent = 0
    for (const row of tier1Result.rows) {
      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      await sendSlackMessage({
        channel,
        text: `Reminder: ${row.full_name} — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👋 *Reminder for ${row.full_name}*\n\nYou're assigned to *${row.summary}* at *${row.venue_name}* tonight at *${row.start_time_et} ET*.\n\nPlease check in when you arrive on site.`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📋 Open Workflow' },
                url: `${process.env.NEXT_PUBLIC_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/workflow/${row.event_id}`,
              },
            ],
          },
        ],
      })
      tier1Sent++
    }

    // TIER 2: 1 hour before — escalation to managers
    const oneHourFromNow = new Date(now.getTime() + 1 * 3600000)

    const tier2Result = await query(
      `SELECT e.id as event_id, e.summary,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              string_agg(s.full_name, ', ') as missing_techs,
              count(s.id) as missing_count
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time > NOW()
         AND e.start_time <= $2
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )
       GROUP BY e.id, e.summary, e.start_time, v.name, v.slack_channel_id`,
      [today, oneHourFromNow.toISOString()]
    )

    let tier2Sent = 0
    for (const row of tier2Result.rows) {
      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      await sendSlackMessage({
        channel,
        text: `🚨 ESCALATION: ${row.missing_count} tech(s) not checked in — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *ESCALATION — No Check-in*\n\n*${row.summary}* at *${row.venue_name}* starts at *${row.start_time_et} ET* — that's less than 1 hour away.\n\n*Missing check-in from:* ${row.missing_techs}\n\n_This requires manager attention._`,
            },
          },
        ],
      })
      tier2Sent++
    }

    // TIER 3: Events already started — still no check-in (post-start alert)
    const tier3Result = await query(
      `SELECT e.id as event_id, e.summary,
              TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_et,
              v.name as venue_name, v.slack_channel_id,
              string_agg(s.full_name, ', ') as missing_techs,
              count(s.id) as missing_count
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       JOIN event_assignments ea ON e.id = ea.event_id
       JOIN staff s ON ea.staff_id = s.id
       WHERE e.event_date = $1
         AND e.workflow_status = 'pending'
         AND e.start_time <= NOW()
         AND e.start_time > NOW() - INTERVAL '2 hours'
         AND NOT EXISTS (
           SELECT 1 FROM workflow_submissions ws
           WHERE ws.event_id = e.id AND ws.staff_id = s.id AND ws.type = 'check_in'
         )
       GROUP BY e.id, e.summary, e.start_time, v.name, v.slack_channel_id`,
      [today]
    )

    let tier3Sent = 0
    for (const row of tier3Result.rows) {
      const channel = row.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (!channel) continue

      await sendSlackMessage({
        channel,
        text: `🔴 CRITICAL: Game started, no check-in — ${row.summary} at ${row.venue_name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔴 *CRITICAL — Game Started, No Check-in*\n\n*${row.summary}* at *${row.venue_name}* started at *${row.start_time_et} ET* and nobody has checked in.\n\n*Missing:* ${row.missing_techs}\n\n_Immediate action required._`,
            },
          },
        ],
      })
      tier3Sent++
    }

    return NextResponse.json({
      ok: true,
      reminders: { tier1: tier1Sent, tier2: tier2Sent, tier3: tier3Sent },
      message: `Sent ${tier1Sent} reminders, ${tier2Sent} escalations, ${tier3Sent} critical alerts`,
    })
  } catch (err) {
    console.error('Error running reminders:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
