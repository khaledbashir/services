import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { HoursBudgets, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { sendSlackMessage } from '@/lib/slack'
import { sendEmail } from '@/lib/email'
import { requireRole, isAuthError } from '@/lib/rbac'

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
      
      <p style="font-size: 14px; color: #666;">[SIMULATION] Please plan next steps with the client before they run out.</p>
      <div style="margin-top: 25px;">
        <a href="${url}" style="background-color: #0A52EF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">View Budget Details</a>
      </div>
    </div>
  `
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  if (process.env.NODE_ENV === 'production' && process.env.DEV_ALERT_BUTTONS !== '1') {
    return NextResponse.json({ error: 'Simulation disabled in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const threshold = parseInt(searchParams.get('threshold') || '0', 10)

  if (threshold !== 50 && threshold !== 75) {
    return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
  }

  if (!isTwentyBackedEnabled('HOURS_BUDGETS')) {
    return NextResponse.json({ error: 'Twenty-backed disabled' }, { status: 400 })
  }

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
    const b = await HoursBudgets.get(params.id)
    if (!b) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
    const raw = b as any
    const totalBudget = Number(raw.totalHoursBudgeted || 0)
    // For simulation, we pretend we are precisely at the threshold if actual is lower
    let used = Number(b.currentHoursUsed || 0)
    let actualPct = totalBudget > 0 ? used / totalBudget : 0
    if (actualPct < threshold / 100) {
       actualPct = threshold / 100
       used = totalBudget * actualPct
    }

    // Force clear existing so we can simulate again
    await query(`DELETE FROM budget_alert_log WHERE budget_id = $1 AND threshold = $2`, [b.id, threshold])

    const clientName = b.budgetClient?.name || 'Unknown Client'
    const pctStr = `${Math.round(actualPct * 100)}%`
    const url = `${origin}/hours-budgets/${b.id}`

    let slackSent = false
    if (DESIGN_CHANNEL) {
      try {
        await sendSlackMessage({ channel: DESIGN_CHANNEL, text: '', blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:chart_with_upwards_trend: *[SIMULATION] Hours budget at ${threshold}% — ${clientName}*\n${used.toFixed(1)} of ${totalBudget.toFixed(1)} hours used (${pctStr}).\n<${url}|View Budget Details>\nPlan next steps with the client before they run out.`
            }
          }
        ]})
        slackSent = true
      } catch (err) {
        console.error('[simulate] Slack error', err)
      }
    }

    let emailSent = false
    const clientEmail = raw.budgetClient?.email || raw.budgetClientEmails?.[0] || null
    if (clientEmail || CC_EMAIL) {
      try {
        const recipients = [clientEmail, CC_EMAIL].filter(Boolean) as string[]
        await sendEmail(
          recipients,
          `ANC — [SIMULATION] Hours Budget Alert: ${clientName} at ${pctStr}`,
          formatEmailHtml(clientName, pctStr, used.toFixed(1), totalBudget.toFixed(1), url)
        )
        emailSent = true
      } catch (err) {
        console.error('[simulate] Email error', err)
      }
    }

    await query(`
      INSERT INTO budget_alert_log (budget_id, budget_client_name, threshold, percent_at_alert, hours_used, hours_budgeted, slack_sent, email_sent, email_recipient)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [b.id, clientName, threshold, Math.round(actualPct * 100), used, totalBudget, slackSent, emailSent, clientEmail])

    return NextResponse.json({ success: true, slackSent, emailSent })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
