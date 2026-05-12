/**
 * Consultant Context — gathers live ANC data and serializes it as a
 * compact markdown block we prepend to every message sent to the
 * AnythingLLM workspace. Without this the model only has the system
 * prompt and hallucinates generic "procurement consultant" answers
 * (Ahmad caught it asking "who am I" and getting a stranger's role).
 */

import { query } from '@/lib/db'
import { getReceiptInsights } from '@/lib/receipt-insights'

interface UserContext {
  fullName: string | null
  email: string | null
  role: string | null
}

export async function buildConsultantContext(user: UserContext): Promise<string> {
  const today = new Date()
  const currentMonth = today.toISOString().slice(0, 7)

  // ── Retainer meter (current month) ───────────────────────────────
  const meterRes = await query(
    `SELECT
       COALESCE(SUM(actual_hours), 0)::float8 as hours_used,
       COUNT(*) FILTER (WHERE retainer_covered AND status = 'shipped')::int as fix_count_shipped,
       COUNT(*) FILTER (WHERE classification = 'NEW' AND status NOT IN ('shipped', 'cancelled', 'paid'))::int as open_change_orders
     FROM service_requests
     WHERE retainer_covered = true
       AND status = 'shipped'
       AND TO_CHAR(shipped_at, 'YYYY-MM') = $1`,
    [currentMonth]
  ).catch(() => ({ rows: [{ hours_used: 0, fix_count_shipped: 0, open_change_orders: 0 }] }))

  const meter = meterRes.rows[0]
  const capHours = 12
  const hoursUsed = Number(meter.hours_used || 0)
  const hoursRemaining = Math.max(0, capHours - hoursUsed)
  const overage = Math.max(0, hoursUsed - capHours)

  // ── Recent shipped fixes (last 14 days) ──────────────────────────
  const shippedRes = await query(
    `SELECT summary, actual_hours, TO_CHAR(shipped_at, 'YYYY-MM-DD') as shipped_at, area
     FROM service_requests
     WHERE status = 'shipped' AND shipped_at >= NOW() - INTERVAL '14 days'
     ORDER BY shipped_at DESC LIMIT 20`
  ).catch(() => ({ rows: [] }))

  // ── Open service requests / change orders ────────────────────────
  const openRes = await query(
    `SELECT id, summary, classification, status, requester, estimated_hours, quote_amount, project,
            TO_CHAR(received_at, 'YYYY-MM-DD') as received_at
     FROM service_requests
     WHERE status NOT IN ('shipped', 'cancelled', 'paid')
     ORDER BY received_at DESC LIMIT 25`
  ).catch(() => ({ rows: [] }))

  // ── Receipt insights (already memoized) ──────────────────────────
  let insightsBlock = ''
  try {
    const insights = await getReceiptInsights({ force: false })
    if (insights.receipt_count > 0) {
      const recurring = insights.recurring_patterns.slice(0, 12)
        .map((p) => `  - **${p.vendor}** (${p.cadence}): typically $${p.typical_amount_usd.toFixed(2)}, ${p.charge_count}× charged, $${p.total_paid_usd.toFixed(2)} total${p.next_expected ? `, next expected ~${p.next_expected}` : ''}`)
        .join('\n')
      const anomalies = insights.anomalies.slice(0, 5)
        .map((a) => `  - **${a.vendor}**: ${a.description} (${a.severity})`)
        .join('\n')
      const missing = insights.missing_this_month
        .map((m) => `  - **${m.vendor}** — last seen ${m.last_seen}${m.expected_around ? `, expected around ${m.expected_around}` : ''}`)
        .join('\n')
      insightsBlock = `
## SaaS / Cloud Expenses
- Total receipts logged: **${insights.receipt_count}** worth **$${insights.total_paid_usd.toFixed(2)}**
- Trailing-90d run rate: **$${insights.projection.monthly_run_rate_usd.toFixed(2)}/mo** → projected **$${insights.projection.yearly_projection_usd.toFixed(0)}/yr**

### Recurring vendors (by spend)
${recurring || '  - (none yet)'}

${anomalies ? `### Anomalies\n${anomalies}\n` : ''}${missing ? `### Recurring vendors NOT seen this month\n${missing}\n` : ''}`.trim()
    }
  } catch {
    // insights failure is non-fatal
  }

  // ── Compose the markdown ─────────────────────────────────────────
  const lines: string[] = []

  lines.push('# LIVE ANC OPERATING CONTEXT')
  lines.push('You are advising ANC Sports. The following data is pulled live from their dashboard right now. Use these specific numbers and names in your answer — do NOT speak in generic procurement terms.')
  lines.push('')

  if (user.fullName || user.email) {
    lines.push('## Who is asking')
    lines.push(`The signed-in user is **${user.fullName || user.email}**${user.role ? ` (role: ${user.role})` : ''}. They are an ANC Sports staff member with admin access to the service-contract dashboard at services.ancsports.net.`)
    lines.push('')
  }

  lines.push('## Business in one paragraph')
  lines.push('ANC Sports operates technology platforms (scoreboards, ribbon boards, fascia displays, LED video walls) at sports/entertainment venues nationwide — NBA arenas, MLB stadiums, college football, MiLB ballparks, etc. They sell installations and ongoing service contracts. This dashboard tracks one such service contract: a **$1,500/month retainer covering 12 hours of work per month**, overage billed at **$90/hr**, with a **30-day warranty** on shipped work. Change orders (new feature builds) are quoted separately. The work is a mix of fixes inside the service contract (retainer hours) and one-off paid projects (change orders).')
  lines.push('')

  lines.push('## Current service contract status — ' + currentMonth)
  lines.push(`- Retainer: **${hoursUsed.toFixed(1)} / ${capHours} hrs used** · ${hoursRemaining.toFixed(1)} hrs remaining${overage > 0 ? ` · **${overage.toFixed(1)} hrs overage** at $90/hr` : ''}`)
  lines.push(`- Fixes shipped this month under the retainer: ${meter.fix_count_shipped}`)
  lines.push(`- Open change orders / requests: ${meter.open_change_orders}`)
  lines.push('')

  if (shippedRes.rows.length > 0) {
    lines.push('## Last 14 days — shipped')
    for (const row of shippedRes.rows) {
      lines.push(`- ${row.shipped_at} · ${row.area || 'general'} · ${row.actual_hours ? row.actual_hours + 'h' : '—'} · ${row.summary?.slice(0, 140) || '(no summary)'}`)
    }
    lines.push('')
  }

  if (openRes.rows.length > 0) {
    lines.push('## Open requests / change orders')
    for (const row of openRes.rows) {
      const meta = [
        row.classification,
        row.status,
        row.project,
        row.quote_amount ? `$${Number(row.quote_amount).toFixed(0)}` : (row.estimated_hours ? `~${row.estimated_hours}h` : null),
        row.requester || null,
      ].filter(Boolean).join(' · ')
      lines.push(`- [${meta}] ${row.summary?.slice(0, 160) || '(no summary)'}`)
    }
    lines.push('')
  }

  if (insightsBlock) {
    lines.push(insightsBlock)
    lines.push('')
  }

  lines.push('---')
  lines.push('Use the data above when the user asks anything about THEIR business. For benchmark questions ("typical SaaS pricing", "industry norms"), still use web search and cite sources.')

  return lines.join('\n')
}
