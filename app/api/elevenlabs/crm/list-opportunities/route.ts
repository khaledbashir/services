export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery, compactDate, moneyLabel } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const stage = cleanQuery(request.nextUrl.searchParams.get('stage'), 60).toUpperCase()
  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit') || '5', 10) || 5, 1), 15)

  try {
    const opps = await twentyClient.getOpportunities()
    const filtered = opps.filter(o => {
      const s = String(o.bidStatus || o.stage || '').toUpperCase()
      if (['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED'].includes(s)) return false
      if (stage && !s.includes(stage)) return false
      return true
    })
    const sorted = filtered.sort((a, b) => (b.amount?.amountMicros || 0) - (a.amount?.amountMicros || 0))
    const top = sorted.slice(0, limit)
    const totalMicros = filtered.reduce((sum, o) => sum + (o.amount?.amountMicros || 0), 0)
    const totalLabel = moneyLabel({ amountMicros: totalMicros, currencyCode: 'USD' })

    const voiceBrief = [
      `${filtered.length} open ${filtered.length === 1 ? 'opportunity' : 'opportunities'}${stage ? ` matching ${stage}` : ''}.`,
      totalLabel ? `Pipeline value about ${totalLabel}.` : null,
      top[0] ? `Largest: ${top[0].name}${top[0].amount ? ` at ${moneyLabel(top[0].amount)}` : ''}.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      pipelineValue: totalLabel,
      opportunities: top.map(o => ({
        id: o.id,
        name: o.name,
        stage: o.bidStatus || o.stage || null,
        amount: moneyLabel(o.amount),
        closeDate: compactDate(o.closeDate),
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('crm list-opportunities:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'list_failed' },
      { status: 500 }
    )
  }
}
