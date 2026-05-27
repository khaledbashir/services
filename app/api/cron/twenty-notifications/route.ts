export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

/**
 * Cron: Twenty CRM → Slack Notifications
 * Schedule: Every 15 minutes
 *
 * Polls Twenty CRM for notable changes and sends Slack notifications:
 * - Won deals → #wins or default channel
 * - High-priority tickets created → #ops
 * - Overdue tasks → #ops
 * - Expiring contracts (checked once daily) → #ops
 */

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
const OPS_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || ''

async function twentyFetch(endpoint: string): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })
}

async function getLastCheckTime(): Promise<string> {
  const result = await query(
    `SELECT value FROM app_settings WHERE key = 'twenty_notifications_last_check'`
  )
  if (result.rows.length > 0) return result.rows[0].value
  // Default: 15 minutes ago
  return new Date(Date.now() - 15 * 60 * 1000).toISOString()
}

async function updateLastCheckTime(): Promise<void> {
  const now = new Date().toISOString()
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('twenty_notifications_last_check', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [now]
  )
}

export async function GET() {
  if (!TWENTY_API_KEY || !OPS_CHANNEL) {
    return NextResponse.json({ skipped: true, reason: 'TWENTY_API_KEY or SLACK_DEFAULT_CHANNEL not set' })
  }

  try {
    const lastCheck = await getLastCheckTime()
    const notifications: string[] = []

    // 1. Won Deals — check opportunities updated since last check with bidStatus=WON
    try {
      const res = await twentyFetch(`opportunities?filter=bidStatus[eq]:"WON"&limit=20`)
      const data = await res.json()
      const wonDeals = (data?.data?.opportunities || []).filter(
        (o: any) => new Date(o.updatedAt) > new Date(lastCheck)
      )
      for (const deal of wonDeals) {
        const amount = deal.amount?.amountMicros
          ? `$${(deal.amount.amountMicros / 1_000_000).toLocaleString()}`
          : ''
        const msg = `:trophy: *Deal Won!* ${deal.name}${amount ? ` — ${amount}` : ''}`
        await sendSlackMessage({ channel: OPS_CHANNEL, text: msg, blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: msg } }
        ]})
        notifications.push(`won: ${deal.name}`)
      }
    } catch (err) {
      console.error('Twenty notifications — won deals check failed:', err)
    }

    // 2. High-Priority Tickets — newly created since last check
    try {
      const res = await twentyFetch(`serviceTickets?filter=priority[eq]:"PRIORITY_HIGH"&limit=20`)
      const data = await res.json()
      const highPriTickets = (data?.data?.serviceTickets || []).filter(
        (t: any) => new Date(t.createdAt) > new Date(lastCheck)
      )
      for (const ticket of highPriTickets) {
        const msg = `:rotating_light: *High Priority Ticket* — ${ticket.name}\n*Venue:* ${ticket.venueName || 'Unknown'}\n*Status:* ${ticket.ticketStatus || 'New'}`
        await sendSlackMessage({ channel: OPS_CHANNEL, text: `High priority ticket: ${ticket.name}`, blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: msg } }
        ]})
        notifications.push(`high-pri ticket: ${ticket.name}`)
      }
    } catch (err) {
      console.error('Twenty notifications — high-pri tickets check failed:', err)
    }

    // 3. Overdue Tasks — due before now, not done
    try {
      const res = await twentyFetch(`tasks?limit=20`)
      const data = await res.json()
      const now = new Date()
      const overdueTasks = (data?.data?.tasks || []).filter(
        (t: any) => t.dueAt && new Date(t.dueAt) < now && t.status !== 'DONE'
      )
      // Only notify about tasks that became overdue since last check
      const newlyOverdue = overdueTasks.filter(
        (t: any) => {
          const dueDate = new Date(t.dueAt)
          const lastCheckDate = new Date(lastCheck)
          // Task due date is between last check and now (just became overdue)
          return dueDate > lastCheckDate && dueDate < now
        }
      )
      for (const task of newlyOverdue) {
        const dueStr = new Date(task.dueAt).toLocaleDateString()
        const msg = `:warning: *Overdue Task* — ${task.title}\n*Due:* ${dueStr}\n*Status:* ${task.status || 'TODO'}`
        await sendSlackMessage({ channel: OPS_CHANNEL, text: `Overdue: ${task.title}`, blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: msg } }
        ]})
        notifications.push(`overdue: ${task.title}`)
      }
    } catch (err) {
      console.error('Twenty notifications — overdue tasks check failed:', err)
    }

    // 4. Expiring Contracts — check once per day (only if last check was >23h ago)
    const lastCheckDate = new Date(lastCheck)
    const hoursSinceCheck = (Date.now() - lastCheckDate.getTime()) / (1000 * 60 * 60)
    if (hoursSinceCheck >= 23 || lastCheck === new Date(Date.now() - 15 * 60 * 1000).toISOString()) {
      try {
        const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const res = await twentyFetch(`companies?limit=60`)
        const data = await res.json()
        const expiring = (data?.data?.companies || []).filter(
          (c: any) => c.contractEnd && c.contractEnd <= in90Days && c.contractEnd >= new Date().toISOString().split('T')[0]
        )
        if (expiring.length > 0) {
          const lines = expiring.map((c: any) => `• ${c.name} — expires ${c.contractEnd}`).join('\n')
          const msg = `:calendar: *Contracts Expiring Within 90 Days*\n${lines}`
          await sendSlackMessage({ channel: OPS_CHANNEL, text: `${expiring.length} contracts expiring soon`, blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: msg } }
          ]})
          notifications.push(`${expiring.length} expiring contracts`)
        }
      } catch (err) {
        console.error('Twenty notifications — expiring contracts check failed:', err)
      }
    }

    await updateLastCheckTime()

    // Log notifications sent
    if (notifications.length > 0) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('twenty_notification_sent', 'system', NULL, NULL, $1)`,
        [JSON.stringify({ notifications, lastCheck })]
      )
    }

    return NextResponse.json({
      success: true,
      notificationsSent: notifications.length,
      notifications,
      lastCheck,
    })
  } catch (err) {
    console.error('Twenty notifications cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Twenty notifications failed' },
      { status: 500 }
    )
  }
}
