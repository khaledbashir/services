import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery, compactDate, moneyLabel } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveOpportunity } from '@/lib/elevenlabs-crm-resolve'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json_body' }, { status: 400 })
  }

  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const oppQuery = cleanQuery(typeof body.opportunity === 'string' ? body.opportunity : '', 200)
  const stage = cleanQuery(typeof body.stage === 'string' ? body.stage : '', 60).toUpperCase() || undefined
  const bidStatus = cleanQuery(typeof body.bid_status === 'string' ? body.bid_status : '', 60).toUpperCase() || undefined
  const closeDate = cleanQuery(typeof body.close_date === 'string' ? body.close_date : '', 20) || undefined
  const amount = typeof body.amount === 'number' ? body.amount : (typeof body.amount === 'string' ? Number(body.amount) || undefined : undefined)
  const currency = cleanQuery(typeof body.currency === 'string' ? body.currency : '', 8) || 'USD'

  if (!oppQuery) {
    return NextResponse.json({ ok: false, error: 'opportunity_required' }, { status: 400 })
  }
  if (!stage && !bidStatus && !closeDate && amount === undefined) {
    return NextResponse.json({ ok: false, error: 'no_changes' }, { status: 400 })
  }

  try {
    const found = await resolveOpportunity(oppQuery)
    if (!found) {
      return NextResponse.json({
        ok: false,
        error: 'opportunity_not_found',
        voiceBrief: `I could not find an opportunity named "${oppQuery}".`,
      }, { status: 404 })
    }

    await twentyClient.updateOpportunity(found.id, {
      stage,
      bidStatus,
      amount,
      currency,
      closeDate,
    })

    const parts = [`Opportunity "${found.record.name}" updated.`]
    if (stage) parts.push(`Stage now ${stage}.`)
    if (bidStatus) parts.push(`Bid status ${bidStatus}.`)
    if (typeof amount === 'number') parts.push(`Amount ${moneyLabel({ amountMicros: amount * 1_000_000, currencyCode: currency })}.`)
    if (closeDate) parts.push(`Close date ${compactDate(closeDate)}.`)

    return NextResponse.json({
      ok: true,
      updated: true,
      opportunity: { id: found.id, name: found.record.name },
      voiceBrief: parts.join(' '),
    })
  } catch (error) {
    console.error('crm update-opportunity:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'update_failed' },
      { status: 500 }
    )
  }
}
