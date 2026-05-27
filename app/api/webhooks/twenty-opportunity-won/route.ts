import { NextRequest, NextResponse } from 'next/server'
import { sendSupportMailboxEmail } from '@/lib/crm-support-email'
import { query } from '@/lib/db'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
const WIN_NOTIFY_TO = [
  'krissy.carter@anc.com',
  'kirsten.savage@anc.com',
  'jireh.billings@anc.com',
  'alexis.ventarola@anc.com',
]

const TWENTY_BASE = 'https://crm.ancsports.net'

function fmtMoney(amountMicros: number | null | undefined, currencyCode: string | null | undefined): string {
  if (!amountMicros) return '—'
  const amount = Number(amountMicros) / 1_000_000
  const cc = currencyCode || 'USD'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(amount)
}

interface OpportunityRecord {
  id: string
  name?: string | null
  stage?: string | null
  opportunityNumber?: string | null
  amount?: { amountMicros?: number; currencyCode?: string } | null
  dealValue?: { amountMicros?: number; currencyCode?: string } | null
  closeDate?: string | null
  businessUnit?: string | null
  serviceType?: string[] | null
  league?: string | null
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'auth' }, { status: 401 })
  }

  try {
    const payload = await request.json()

    // Twenty webhook shape: { eventName: 'opportunity.updated', objectMetadata: {...},
    //                        record: {...}, previousRecord: {...} }
    const eventName = payload.eventName || ''
    const record: OpportunityRecord = payload.record || {}
    const previousRecord: OpportunityRecord = payload.previousRecord || {}

    if (!eventName.startsWith('opportunity.')) {
      return NextResponse.json({ skipped: true, reason: 'not an opportunity event' })
    }

    const newStage = record.stage || ''
    const prevStage = previousRecord.stage || ''
    const justWon = newStage === 'WON' && prevStage !== 'WON'

    if (!justWon) {
      return NextResponse.json({ skipped: true, reason: `stage ${prevStage} → ${newStage}` })
    }

    // Idempotency: don't double-send. Track sent notifications.
    await query(
      `CREATE TABLE IF NOT EXISTS opportunity_win_notifications (
        opportunity_id TEXT PRIMARY KEY,
        notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      [],
    )

    const existing = await query(
      'SELECT 1 FROM opportunity_win_notifications WHERE opportunity_id = $1',
      [record.id],
    )
    if (existing.rows.length) {
      return NextResponse.json({ skipped: true, reason: 'already notified', id: record.id })
    }

    const oppNum = record.opportunityNumber || '—'
    const dealName = record.name || '(no name)'
    const dealValue = fmtMoney(
      record.dealValue?.amountMicros || record.amount?.amountMicros,
      record.dealValue?.currencyCode || record.amount?.currencyCode,
    )
    const closeDate = record.closeDate ? new Date(record.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const businessUnit = record.businessUnit || '—'
    const league = record.league || '—'
    const url = `${TWENTY_BASE}/object/opportunity/${record.id}`

    const subject = `🎉 Closed/Won — ${dealName} (${dealValue})`
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
        <h2 style="margin:0 0 12px;color:#0a52ef">🎉 New Win</h2>
        <p style="margin:0 0 20px;color:#333">A deal just moved to <strong>Closed/Won</strong>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333">
          <tr><td style="padding:6px 0;color:#666;width:160px">Deal name</td><td style="padding:6px 0"><a href="${url}" style="color:#0a52ef;text-decoration:none">${dealName}</a></td></tr>
          <tr><td style="padding:6px 0;color:#666">Opportunity #</td><td style="padding:6px 0"><strong>${oppNum}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Value</td><td style="padding:6px 0"><strong>${dealValue}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Close date</td><td style="padding:6px 0">${closeDate}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Business unit</td><td style="padding:6px 0">${businessUnit}</td></tr>
          <tr><td style="padding:6px 0;color:#666">League</td><td style="padding:6px 0">${league}</td></tr>
        </table>
        <p style="margin:20px 0 0">
          <a href="${url}" style="display:inline-block;background:#0a52ef;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:500">Open in CRM →</a>
        </p>
        <p style="margin:24px 0 0;color:#888;font-size:12px">Mirrors the #revenue-new-win-alert Slack notification.</p>
      </div>
    `

    await sendSupportMailboxEmail({
      to: WIN_NOTIFY_TO,
      subject,
      html,
    })

    await query(
      `INSERT INTO opportunity_win_notifications (opportunity_id) VALUES ($1)
       ON CONFLICT (opportunity_id) DO NOTHING`,
      [record.id],
    )

    return NextResponse.json({ sent: true, to: WIN_NOTIFY_TO, opp: record.id })
  } catch (err) {
    console.error('[twenty-opportunity-won] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unexpected' }, { status: 500 })
  }
}
