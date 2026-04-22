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
  if (!isTwentyBackedEnabled('HOURS_BUDGETS')) {
    return NextResponse.json({ error: 'Twenty-backed hours budgets are disabled' }, { status: 400 })
  }

  let checked = 0
  let fired_50 = 0
  let fired_75 = 0
  let skipped = 0

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'

  try {
    let cursor: string | null = null
    do {
      const page = await HoursBudgets.list({ limit: 100, startingAfter: cursor || undefined })
      
      for (const b of page.items) {
        checked++
        
        // Use any to access custom fields that might not be on the precise TS facade
        const raw = b as any
        // Twenty's cap field is `contractedHours`; the legacy `totalHoursBudgeted`
        // never existed and was silently 0, so every cron pass checked 75 and fired 0.
        const totalBudget = Number(raw.contractedHours ?? raw.totalHoursBudgeted ?? 0)
        const used = Number(b.currentHoursUsed || 0)
        
        if (totalBudget <= 0) continue
        
        const pct = used / totalBudget
        if (pct < 0.5) continue

        let threshold = 0
        if (pct >= 0.75) threshold = 75
        else if (pct >= 0.5) threshold = 50

        if (!threshold) continue

        // Check deduplication
        const exist = await query(
          `SELECT id FROM budget_alert_log WHERE budget_id = $1 AND threshold = $2`,
          [b.id, threshold]
        )
        
        if (exist.rows.length > 0) {
          skipped++
          continue
        }

        const clientName = b.budgetClient?.name || 'Unknown Client'
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
                  text: `:chart_with_upwards_trend: *Hours budget at ${threshold}% — ${clientName}*\n${used.toFixed(1)} of ${totalBudget.toFixed(1)} hours used (${pctStr}).\n<${url}|View Budget Details>\nPlan next steps with the client before they run out.`
                }
              }
            ]})
            slackSent = true
          } catch (err) {
            console.error('[cron] Slack failed', err)
          }
        }

        let emailSent = false
        const clientEmail = raw.budgetClient?.email || raw.budgetClientEmails?.[0] || null
        
        if (clientEmail || CC_EMAIL) {
          try {
            const recipients = [clientEmail, CC_EMAIL].filter(Boolean) as string[]
            await sendEmail(
              recipients,
              `ANC — Hours Budget Alert: ${clientName} at ${pctStr}`,
              formatEmailHtml(clientName, pctStr, used.toFixed(1), totalBudget.toFixed(1), url)
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
          b.id, clientName, threshold, Math.round(pct * 100), used, totalBudget, slackSent, emailSent, clientEmail
        ])

        if (threshold === 75) fired_75++
        if (threshold === 50) fired_50++
      }
      
      cursor = page.hasNextPage ? page.nextCursor : null
    } while (cursor)
    
    return NextResponse.json({ checked, fired_50, fired_75, skipped_already_alerted: skipped })
  } catch (err) {
    console.error('[cron] Hours budget alert failed', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}
