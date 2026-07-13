export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { HoursBudgets, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { sendSlackMessage } from '@/lib/slack'
import { sendEmail } from '@/lib/email'

const DESIGN_CHANNEL = process.env.SLACK_DESIGN_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || ''
const CC_EMAIL = process.env.HOURS_BUDGET_ALERT_CC || ''

function formatEmailHtml(clientName: string, pct: string, used: string, total: string, url: string) {
  return `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2 style="color: #0A52EF; margin-top: 0;">Hours Budget Alert</h2>
      <p style="font-size: 16px;">The hours budget for <strong>${clientName}</strong> has reached <strong>${pct}</strong> consumed.</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0A52EF;">
        <p style="margin: 0; font-size: 15px;"><strong>Used:</strong> ${used} hours</p>
        <p style="margin: 5px 0 0; font-size: 15px;"><strong>Budget:</strong> ${total} hours</p>
      </div>
      
      <p style="font-size: 14px; color: #666;">Please plan next steps with the client before they run out.</p>
      <div style="margin-top: 25px;">
        <a href="${url}" style="background-color: #0A52EF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">View Budget Details</a>
      </div>
    </div>
  `
}

export async function GET() {
  let checked = 0
  let skipped = 0
  const fired: Record<string, number> = {}

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'

  try {
    const budgets: Array<{ id: string; clientName: string; total: number; used: number; clientEmail: string | null }> = []
    if (isTwentyBackedEnabled('HOURS_BUDGETS')) {
      let cursor: string | null = null
      do {
        const page = await HoursBudgets.list({ limit: 100, startingAfter: cursor || undefined })
        for (const b of page.items) {
          const raw = b as any
          budgets.push({
            id: b.id,
            clientName: b.budgetClient?.name || 'Unknown Client',
            total: Number(raw.contractedHours ?? raw.totalHoursBudgeted ?? 0),
            used: Number(b.currentHoursUsed || 0),
            clientEmail: raw.budgetClient?.email || raw.budgetClientEmails?.[0] || null,
          })
        }
        cursor = page.hasNextPage ? page.nextCursor : null
      } while (cursor)
    } else {
      const local = await query(
        `SELECT b.id, b.client_name,
                b.total_hours::float8 AS total,
                COALESCE(SUM(te.hours), 0)::float8 AS used
           FROM designer_hours_budgets b
           LEFT JOIN designer_time_entries te ON te.budget_id = b.id
          GROUP BY b.id`
      )
      budgets.push(...local.rows.map((row) => ({
        id: row.id,
        clientName: row.client_name || 'Unknown Client',
        total: Number(row.total || 0),
        used: Number(row.used || 0),
        clientEmail: null,
      })))
    }

    for (const b of budgets) {
        checked++
        if (b.total <= 0) continue

        const pct = b.used / b.total
        const settings = await query(
          `SELECT thresholds, recipient_email FROM hours_budget_alert_settings WHERE budget_id = $1`,
          [b.id]
        )
        const thresholds = (settings.rows[0]?.thresholds || [25, 50, 75, 85, 90, 95, 100])
          .map(Number)
          .filter((threshold: number) => threshold > 0 && threshold <= 100)
          .sort((a: number, b: number) => a - b)
        const clientEmail = settings.rows[0]?.recipient_email || b.clientEmail

        for (const threshold of thresholds.filter((value: number) => pct * 100 >= value)) {
        const exist = await query(
          `SELECT id FROM budget_alert_log WHERE budget_id = $1 AND threshold = $2`,
          [b.id, threshold]
        )
        if (exist.rows.length > 0) {
          skipped++
          continue
        }

        const clientName = b.clientName
        const pctStr = `${Math.round(pct * 100)}%`
        const url = `${origin}/hours-budgets/${b.id}`

        let slackSent = false
        if (DESIGN_CHANNEL) {
          try {
            await sendSlackMessage({ channel: DESIGN_CHANNEL, text: '', blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `:chart_with_upwards_trend: *Hours budget crossed ${threshold}% — ${clientName}*\n${b.used.toFixed(1)} of ${b.total.toFixed(1)} hours used (${pctStr}).\n<${url}|View Budget Details>\nPlan next steps with the client before they run out.`
                }
              }
            ]})
            slackSent = true
          } catch (err) {
            console.error('[cron] Slack failed', err)
          }
        }

        let emailSent = false
        if (clientEmail || CC_EMAIL) {
          try {
            const recipients = [clientEmail, CC_EMAIL].filter(Boolean) as string[]
            await sendEmail(
              recipients,
              `ANC — Hours Budget Alert: ${clientName} at ${pctStr}`,
              formatEmailHtml(clientName, pctStr, b.used.toFixed(1), b.total.toFixed(1), url)
            )
            emailSent = true
          } catch (err) {
            console.error('[cron] Email failed', err)
          }
        }

        await query(`
          INSERT INTO budget_alert_log (budget_id, budget_client_name, threshold, percent_at_alert, hours_used, hours_budgeted, slack_sent, email_sent, email_recipient)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          b.id, clientName, threshold, Math.round(pct * 100), b.used, b.total, slackSent, emailSent, clientEmail
        ])

        fired[String(threshold)] = (fired[String(threshold)] || 0) + 1
        }
      }

    return NextResponse.json({ checked, fired, skipped_already_alerted: skipped })
  } catch (err) {
    console.error('[cron] Hours budget alert failed', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}
