import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { hoursThisMonth } from '@/lib/service-triage'

/**
 * Retainer-utilization alerts.
 *
 * Two thresholds fire per calendar month:
 *  - "90" — heads-up that we're at 90% of the 12-hr/month service-contract
 *    cap. Lets Joe / Charlie / Jireh top up before we run out.
 *  - "100" — cap reached. Anything more this month is overage at $90/hr.
 *
 * Each (month, threshold) pair only fires once — guarded by a unique
 * constraint on retainer_alerts(month, threshold). This function is safe
 * to call from many places (markShipped, hourly cron, manual trigger).
 */

const DEFAULT_RECIPIENTS = ['joeo@anc.com', 'cdinh@anc.com', 'jbillings@anc.com']
const DEFAULT_CC = ['ahmadbasheerr@gmail.com']
const DEFAULT_PAYONEER_PENDING = 'https://link.payoneer.com/Token?t=E7378F40684A470E9FC572DC15D6B7FE&src=pl'
const DEFAULT_PAYONEER_TOPUP = 'https://link.payoneer.com/Token?t=EB9274F3E2DF4A8AAD467CF44906F1CD&src=pl'
const HOURLY_RATE = 90

function getRecipients(): { to: string[]; cc: string[] } {
  const toRaw = (process.env.RETAINER_ALERT_RECIPIENTS || '').trim()
  const ccRaw = (process.env.RETAINER_ALERT_CC || '').trim()
  const to = toRaw ? toRaw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_RECIPIENTS
  const cc = ccRaw ? ccRaw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_CC
  return { to, cc }
}

function getPayoneerLinks(): { pending: string; topup: string } {
  return {
    pending: process.env.RETAINER_PAYONEER_PENDING_URL || DEFAULT_PAYONEER_PENDING,
    topup: process.env.RETAINER_PAYONEER_TOPUP_URL || DEFAULT_PAYONEER_TOPUP,
  }
}

interface MonthRollup {
  shipped_count: number
  shipped_items: Array<{ summary: string; actual_hours: number; area: string | null; shipped_at: string }>
  change_orders_open_count: number
  change_orders_open_usd: number
  change_orders_paid_count: number
  change_orders_paid_usd: number
}

async function buildMonthRollup(month: string): Promise<MonthRollup> {
  const monthStart = `${month}-01`
  const shippedRows = await query(
    `SELECT summary, COALESCE(actual_hours, 0)::float8 AS actual_hours, area, shipped_at
       FROM service_requests
      WHERE retainer_covered = true
        AND status = 'shipped'
        AND shipped_at >= $1::date
        AND shipped_at < ($1::date + INTERVAL '1 month')
      ORDER BY shipped_at DESC`,
    [monthStart],
  )
  const coOpen = await query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(COALESCE(quote_amount, estimated_usd, 0)), 0)::float8 AS s
       FROM service_requests
      WHERE retainer_covered = false
        AND status IN ('open', 'quoted', 'approved', 'in_progress', 'shipped')
        AND received_at >= $1::date
        AND received_at < ($1::date + INTERVAL '1 month')`,
    [monthStart],
  )
  const coPaid = await query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(COALESCE(paid_amount, quote_amount, estimated_usd, 0)), 0)::float8 AS s
       FROM service_requests
      WHERE retainer_covered = false
        AND status = 'paid'
        AND COALESCE(paid_at, received_at) >= $1::date
        AND COALESCE(paid_at, received_at) < ($1::date + INTERVAL '1 month')`,
    [monthStart],
  )
  return {
    shipped_count: shippedRows.rows.length,
    shipped_items: shippedRows.rows.map((r: any) => ({
      summary: r.summary || '',
      actual_hours: Number(r.actual_hours || 0),
      area: r.area || null,
      shipped_at: r.shipped_at,
    })),
    change_orders_open_count: Number(coOpen.rows[0].c || 0),
    change_orders_open_usd: Number(coOpen.rows[0].s || 0),
    change_orders_paid_count: Number(coPaid.rows[0].c || 0),
    change_orders_paid_usd: Number(coPaid.rows[0].s || 0),
  }
}

function fmtUSD(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function buildEmailHtml(args: {
  threshold: string // '90' | '100'
  month: string
  hoursUsed: number
  capHours: number
  rollup: MonthRollup
  payoneer: { pending: string; topup: string }
  reportUrl: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { threshold, month, hoursUsed, capHours, rollup, payoneer, reportUrl, dashboardUrl } = args
  const overage = Math.max(0, hoursUsed - capHours)
  const monthLabel = new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const headline = threshold === '100'
    ? `Service-contract retainer for ${monthLabel} is fully utilized.`
    : `Service-contract retainer for ${monthLabel} is at 90% utilization.`

  const overageBlock = overage > 0
    ? `<p style="margin:0 0 12px;color:#b91c1c;font-size:14px"><strong>${overage.toFixed(1)} hrs of overage</strong> at $${HOURLY_RATE}/hr = <strong>${fmtUSD(overage * HOURLY_RATE)}</strong> currently uncovered. New work this month will continue billing at $${HOURLY_RATE}/hr until additional hours are added.</p>`
    : threshold === '90'
      ? `<p style="margin:0 0 12px;color:#92400e;font-size:14px">${(capHours - hoursUsed).toFixed(1)} hrs remain this month. New asks landing today will likely push past the cap before ${monthLabel} closes.</p>`
      : ''

  const shippedList = rollup.shipped_items.slice(0, 8).map(item => `
    <li style="margin:0 0 6px;color:#374151;font-size:13px;line-height:1.45">
      <span style="color:#9ca3af;font-size:11px;margin-right:6px">${new Date(item.shipped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      ${item.area ? `<span style="background:#f3f4f6;color:#4b5563;font-size:10px;padding:1px 6px;border-radius:4px;margin-right:6px">${item.area}</span>` : ''}
      ${item.summary.replace(/</g, '&lt;')}
      <span style="color:#6b7280;font-size:11px;margin-left:6px">· ${item.actual_hours}h</span>
    </li>`).join('')

  const moreShipped = rollup.shipped_items.length > 8
    ? `<li style="margin:0;color:#6b7280;font-size:12px">+ ${rollup.shipped_items.length - 8} more — see the full report</li>`
    : ''

  const subject = threshold === '100'
    ? `[ANC service contract] ${monthLabel} retainer cap reached — ${hoursUsed.toFixed(1)}/${capHours} hrs`
    : `[ANC service contract] ${monthLabel} retainer at 90% — ${hoursUsed.toFixed(1)}/${capHours} hrs`

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
  <div style="max-width:640px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div style="background:${threshold === '100' ? '#7f1d1d' : '#b45309'};color:white;padding:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.85;margin-bottom:4px">ANC Service Contract</div>
      <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.3">${headline}</h1>
    </div>

    <div style="padding:24px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px">
        <div style="font-size:36px;font-weight:700;color:#111827;line-height:1">${hoursUsed.toFixed(1)}</div>
        <div style="font-size:14px;color:#6b7280">/ ${capHours} hrs used</div>
      </div>
      <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:16px">
        <div style="height:100%;width:${Math.min(100, (hoursUsed / capHours) * 100).toFixed(1)}%;background:${threshold === '100' ? '#dc2626' : '#f59e0b'}"></div>
      </div>
      ${overageBlock}

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:24px 0 12px;font-weight:600">Shipped this month — ${rollup.shipped_count} items</h2>
      <ul style="list-style:none;padding:0;margin:0 0 16px">
        ${shippedList || '<li style="color:#9ca3af;font-size:13px;font-style:italic">no shipped retainer items yet this month</li>'}
        ${moreShipped}
      </ul>
      <p style="margin:0 0 24px"><a href="${reportUrl}" style="color:#2563eb;font-size:13px;text-decoration:none">View the full ${monthLabel} report →</a></p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:24px 0 12px;font-weight:600">Change orders this month (separate quotes)</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px">Open / quoted / in flight</td>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;text-align:right;font-weight:600">${rollup.change_orders_open_count} · ${fmtUSD(rollup.change_orders_open_usd)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#374151;font-size:13px">Paid</td>
          <td style="padding:10px 0;color:#111827;font-size:13px;text-align:right;font-weight:600">${rollup.change_orders_paid_count} · ${fmtUSD(rollup.change_orders_paid_usd)}</td>
        </tr>
      </table>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:24px 0 12px;font-weight:600">Next steps</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:0;vertical-align:top">
            <a href="${payoneer.topup}" style="display:block;background:#2563eb;color:white;padding:14px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;text-align:center">Add retainer hours · $${HOURLY_RATE}/hr</a>
            <div style="font-size:11px;color:#6b7280;margin-top:6px;text-align:center">Choose any amount — the link lets you set the total.</div>
          </td>
        </tr>
        <tr><td style="height:12px"></td></tr>
        <tr>
          <td style="padding:0;vertical-align:top">
            <a href="${payoneer.pending}" style="display:block;background:white;color:#92400e;padding:14px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;text-align:center;border:1px solid #fde68a">Pay pending invoice</a>
            <div style="font-size:11px;color:#6b7280;margin-top:6px;text-align:center">Existing change order awaiting payment.</div>
          </td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5">
        Live transparency dashboard: <a href="${dashboardUrl}" style="color:#6b7280">${dashboardUrl}</a><br>
        This message was triggered automatically when ${monthLabel} retainer utilization crossed ${threshold}%.
      </p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

interface CheckResult {
  fired: boolean
  threshold?: string
  hours_used: number
  cap_hours: number
  pct: number
  reason?: string
}

/**
 * Compute current utilization, fire alerts that haven't fired yet for the
 * current calendar month. Idempotent — safe to call from anywhere.
 */
export async function checkAndFireRetainerAlerts(): Promise<CheckResult[]> {
  const meter = await hoursThisMonth()
  const month = meter.month // 'YYYY-MM'
  const pct = meter.cap_hours > 0 ? (meter.hours_used / meter.cap_hours) * 100 : 0
  const results: CheckResult[] = []

  const thresholds = [
    { name: '90', minPct: 90 },
    { name: '100', minPct: 100 },
  ]

  for (const t of thresholds) {
    if (pct < t.minPct) {
      results.push({ fired: false, threshold: t.name, hours_used: meter.hours_used, cap_hours: meter.cap_hours, pct, reason: 'below threshold' })
      continue
    }
    // already-fired check via unique constraint — try INSERT first
    let ledger
    try {
      ledger = await query(
        `INSERT INTO retainer_alerts (month, threshold, hours_used, cap_hours, recipients, cc, delivered)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (month, threshold) DO NOTHING
         RETURNING id`,
        [month, t.name, meter.hours_used, meter.cap_hours, getRecipients().to, getRecipients().cc],
      )
    } catch (err) {
      console.error('[retainer-alerts] ledger insert failed:', err)
      results.push({ fired: false, threshold: t.name, hours_used: meter.hours_used, cap_hours: meter.cap_hours, pct, reason: 'ledger error' })
      continue
    }
    if (ledger.rowCount === 0) {
      results.push({ fired: false, threshold: t.name, hours_used: meter.hours_used, cap_hours: meter.cap_hours, pct, reason: 'already fired this month' })
      continue
    }

    const recipients = getRecipients()
    const payoneer = getPayoneerLinks()
    const rollup = await buildMonthRollup(month)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
    const { subject, html } = buildEmailHtml({
      threshold: t.name,
      month,
      hoursUsed: meter.hours_used,
      capHours: meter.cap_hours,
      rollup,
      payoneer,
      reportUrl: `${baseUrl}/service-log/report?month=${month}`,
      dashboardUrl: `${baseUrl}/transparency`,
    })
    const ok = await sendEmail(recipients.to, subject, html, undefined, { cc: recipients.cc })
    await query(
      `UPDATE retainer_alerts SET delivered = $2 WHERE id = $1`,
      [ledger.rows[0].id, ok],
    )
    results.push({ fired: ok, threshold: t.name, hours_used: meter.hours_used, cap_hours: meter.cap_hours, pct })
  }
  return results
}

/**
 * Public links for the /transparency dashboard CTA buttons. Mirrors the
 * env-var resolution above so the dashboard never has to know defaults.
 */
export function getPublicPayoneerLinks(): { pending: string; topup: string; rate: number } {
  return {
    ...getPayoneerLinks(),
    rate: HOURLY_RATE,
  }
}
