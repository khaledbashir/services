import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendEmail } from '@/lib/email'
import { query } from '@/lib/db'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
const WIN_NOTIFY_TO = [
  'krissy.carter@anc.com',
  'kirsten.savage@anc.com',
  'jbillings@anc.com',
  'alexis.ventarola@anc.com',
]
// A deal whose name contains this sentinel routes the alert to the test
// inbox only (used to verify the pipeline end-to-end without emailing the
// real recipients). Real deals never contain it.
const WIN_TEST_SENTINEL = 'ZZWEBHOOKTEST'
const WIN_TEST_TO = ['ahmadbasheerr@gmail.com']

const TWENTY_BASE = 'https://crm.ancsports.net'
const TWENTY_REST = `${process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'}/rest`
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

function fmtMoney(amountMicros: number | string | null | undefined, currencyCode: string | null | undefined): string {
  // Null/0 renders as $0, matching the Slack alert's `Number(micros || 0)` behavior.
  const amount = Number(amountMicros ?? 0) / 1_000_000
  const cc = currencyCode || 'USD'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // UTC like the Slack alert's fmtDate — a bare DATE field must not shift a day in ET.
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

interface OpportunityRecord {
  id: string
  name?: string | null
  stage?: string | null
  bidStatus?: string | null
  opportunityNumber?: string | null
  amount?: { amountMicros?: number; currencyCode?: string } | null
  dealValue?: { amountMicros?: number; currencyCode?: string } | null
  totalProjectRevenue?: { amountMicros?: number; currencyCode?: string } | null
  totalProjectMargin?: { amountMicros?: number; currencyCode?: string } | null
  closeDate?: string | null
  businessUnit?: string | null
}

// Same businessUnit → display label map as the Slack alert.
const TYPE_LABEL: Record<string, string> = {
  TECHNOLOGY: 'Technology',
  VENUE_SERVICES: 'Service',
  MEDIA_SPONSORSHIP: 'Ad Sales',
}

// The webhook payload's record has no relations (owner/company) and can predate
// the totals rollup by a beat — re-read the record like the Slack alert does so
// both surfaces render identical numbers. Falls back to the payload record.
async function fetchFullOpportunity(id: string): Promise<OpportunityRecord | null> {
  if (!TWENTY_API_KEY) return null
  try {
    const res = await fetch(`${TWENTY_REST}/opportunities/${id}`, {
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const body = await res.json()
    return body?.data?.opportunity || body?.opportunity || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body once: Twenty's HMAC is computed over `${timestamp}:${body}`,
  // so we must hash the exact bytes it sent, then parse.
  const rawBody = await request.text()

  // Auth. Twenty does NOT send a plain secret header — it signs each webhook:
  //   X-Twenty-Webhook-Signature = HMAC-SHA256(secret, `${timestamp}:${body}`)
  //   X-Twenty-Webhook-Timestamp = <ms>
  // (the old `x-webhook-secret` check rejected every real Twenty delivery with
  // 401, which is why no win alert ever fired.) Accept the HMAC signature, and
  // still accept a plain x-webhook-secret header for manual/test calls.
  const plainSecret = request.headers.get('x-webhook-secret')
  const sig = request.headers.get('x-twenty-webhook-signature')
  const ts = request.headers.get('x-twenty-webhook-timestamp')
  let authed = plainSecret != null && plainSecret === WEBHOOK_SECRET
  if (!authed && sig && ts) {
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex')
    authed =
      expected.length === sig.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  }
  if (!authed) {
    return NextResponse.json({ error: 'auth' }, { status: 401 })
  }

  try {
    const payload = JSON.parse(rawBody || '{}')

    // Twenty webhook shape: { eventName: 'opportunity.updated', objectMetadata: {...},
    //                        record: {...}, previousRecord: {...} }
    const eventName = payload.eventName || ''
    const record: OpportunityRecord = payload.record || {}
    const previousRecord: OpportunityRecord = payload.previousRecord || {}

    if (!eventName.startsWith('opportunity.')) {
      return NextResponse.json({ skipped: true, reason: 'not an opportunity event' })
    }

    // A deal is "Closed/Won" via the bidStatus field ("Opportunity Status"),
    // NOT stage — stage has no WON value, so the old stage check could never
    // fire. Fire only on a genuine transition into WON so bulk edits of
    // already-won deals don't re-notify: prefer the webhook's updatedFields
    // signal (bidStatus actually changed on this update), fall back to the
    // previous-record diff when present. The idempotency table below is the
    // hard backstop (one alert per opportunity, ever).
    const newStatus = (record.bidStatus || '').toUpperCase()
    const prevStatus = (previousRecord.bidStatus || '').toUpperCase()
    const updatedFields: string[] = Array.isArray((payload as { updatedFields?: unknown }).updatedFields)
      ? ((payload as { updatedFields: string[] }).updatedFields)
      : []
    const bidStatusChanged = updatedFields.length
      ? updatedFields.includes('bidStatus')
      : prevStatus
        ? prevStatus !== 'WON'
        : true
    const justWon = newStatus === 'WON' && bidStatusChanged

    console.log('[twenty-opportunity-won]', JSON.stringify({
      event: eventName,
      payloadKeys: Object.keys(payload || {}),
      hasUpdatedFields: updatedFields.length > 0,
      updatedFields,
      newStatus,
      prevStatus,
      bidStatusChanged,
      justWon,
    }))

    if (!justWon) {
      return NextResponse.json({ skipped: true, reason: `bidStatus ${prevStatus || '?'} → ${newStatus || '?'}` })
    }

    // Test deals (name contains the sentinel) route to the test inbox and skip
    // the idempotency gate so the pipeline can be re-verified on demand.
    const isTest = (record.name || '').toUpperCase().includes(WIN_TEST_SENTINEL)
    const notifyTo = isTest ? WIN_TEST_TO : WIN_NOTIFY_TO

    // Idempotency: don't double-send. Track sent notifications.
    await query(
      `CREATE TABLE IF NOT EXISTS opportunity_win_notifications (
        opportunity_id TEXT PRIMARY KEY,
        notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      [],
    )

    if (!isTest) {
      const existing = await query(
        'SELECT 1 FROM opportunity_win_notifications WHERE opportunity_id = $1',
        [record.id],
      )
      if (existing.rows.length) {
        return NextResponse.json({ skipped: true, reason: 'already notified', id: record.id })
      }
    }

    // Financials MUST mirror the #revenue-new-win-alert Slack alert (notify-deal-won):
    // totalProjectRevenue / totalProjectMargin — never dealValue/amount (SF Sale_Price /
    // Actual_Revenue mirrors that can disagree). Re-read the record like the Slack fn
    // does; fall back to the webhook payload if the CRM read fails.
    const opp: OpportunityRecord = (await fetchFullOpportunity(record.id)) || record

    // Field list is Krissy's spec (2026-07-27) — exactly these six rows, no extras.
    // "Contract Award Date" = closeDate: the SF-parity forecast export maps its
    // Award Date column to closeDate (Contract Completion Date is a separate,
    // later milestone).
    const oppNum = opp.opportunityNumber || record.opportunityNumber || '—'
    const dealName = opp.name || record.name || '(no name)'
    const revenueMicros = Number(opp.totalProjectRevenue?.amountMicros ?? 0)
    const marginMicros = Number(opp.totalProjectMargin?.amountMicros ?? 0)
    const currency = opp.totalProjectRevenue?.currencyCode
    const revenue = fmtMoney(revenueMicros, currency)
    const margin = fmtMoney(marginMicros, opp.totalProjectMargin?.currencyCode || currency)
    const awardDate = fmtDate(opp.closeDate || record.closeDate)
    const rawBu = opp.businessUnit || record.businessUnit || ''
    const businessUnit = TYPE_LABEL[rawBu] || rawBu || '—'
    const url = `${TWENTY_BASE}/object/opportunity/${record.id}`

    const subject = `🎉 Closed/Won — ${dealName} (${revenue} rev / ${margin} margin)`
    const row = (label: string, value: string, bold = false) =>
      `<tr><td style="padding:6px 0;color:#666;width:190px">${label}</td><td style="padding:6px 0">${bold ? `<strong>${value}</strong>` : value}</td></tr>`
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
        <h2 style="margin:0 0 12px;color:#0a52ef">🎉 New Win</h2>
        <p style="margin:0 0 20px;color:#333">A deal just moved to <strong>Closed/Won</strong>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333">
          ${row('Opportunity Name', `<a href="${url}" style="color:#0a52ef;text-decoration:none">${dealName}</a>`)}
          ${row('Opportunity Number', oppNum, true)}
          ${row('Revenue', revenue, true)}
          ${row('Margin', margin, true)}
          ${row('Business Unit', businessUnit)}
          ${row('Contract Award Date', awardDate)}
        </table>
        <p style="margin:20px 0 0">
          <a href="${url}" style="display:inline-block;background:#0a52ef;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:500">Open in CRM →</a>
        </p>
        <p style="margin:24px 0 0;color:#888;font-size:12px">Values match the #revenue-new-win-alert Slack notification.</p>
      </div>
    `

    const sent = await sendEmail(notifyTo, subject, html)
    if (!sent) {
      console.error('[twenty-opportunity-won] win alert email failed to send for', record.id)
    }

    if (!isTest) {
      await query(
        `INSERT INTO opportunity_win_notifications (opportunity_id) VALUES ($1)
         ON CONFLICT (opportunity_id) DO NOTHING`,
        [record.id],
      )
    }

    return NextResponse.json({ sent: true, to: notifyTo, opp: record.id, test: isTest })
  } catch (err) {
    console.error('[twenty-opportunity-won] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unexpected' }, { status: 500 })
  }
}
