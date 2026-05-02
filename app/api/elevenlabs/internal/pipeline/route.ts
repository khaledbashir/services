import { NextRequest, NextResponse } from 'next/server'
import { twentyClient } from '@/lib/twenty-client'
import {
  authorizeVoiceCall,
  cleanQuery,
  compactDate,
  moneyLabel,
} from '@/lib/elevenlabs-internal-auth'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const stage = cleanQuery(request.nextUrl.searchParams.get('stage'), 60)
  const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 25)

  try {
    const opps = await twentyClient.getOpportunities()

    const filtered = opps.filter(o => {
      const status = String(o.bidStatus || o.stage || '').toUpperCase()
      const closed = ['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED']
      if (closed.includes(status)) return false
      if (stage && !status.includes(stage.toUpperCase())) return false
      return true
    })

    const sorted = filtered.sort((a, b) => {
      const av = a.amount?.amountMicros || 0
      const bv = b.amount?.amountMicros || 0
      if (av !== bv) return bv - av
      return String(b.closeDate || b.createdAt || '').localeCompare(String(a.closeDate || a.createdAt || ''))
    })

    const top = sorted.slice(0, limit)
    const totalValueMicros = filtered.reduce((sum, o) => sum + (o.amount?.amountMicros || 0), 0)
    const totalLabel = moneyLabel({ amountMicros: totalValueMicros, currencyCode: 'USD' })

    const stageBreakdown = new Map<string, number>()
    for (const o of filtered) {
      const s = String(o.bidStatus || o.stage || 'UNKNOWN').toUpperCase()
      stageBreakdown.set(s, (stageBreakdown.get(s) || 0) + 1)
    }

    const voiceBrief = [
      `${filtered.length} open ${filtered.length === 1 ? 'opportunity' : 'opportunities'}${stage ? ` matching ${stage}` : ''}.`,
      totalLabel ? `Pipeline value about ${totalLabel}.` : null,
      top[0] ? `Largest is ${top[0].name}${top[0].amount ? ` at ${moneyLabel(top[0].amount)}` : ''}.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      caller: auth.staff?.fullName || null,
      filterStage: stage || null,
      counts: { open: filtered.length, returned: top.length },
      pipelineValue: totalLabel,
      stageBreakdown: Object.fromEntries(stageBreakdown),
      opportunities: top.map(o => ({
        id: o.id,
        name: o.name,
        stage: o.bidStatus || o.stage || null,
        amount: moneyLabel(o.amount),
        closeDate: compactDate(o.closeDate),
        proposalUrl: o.proposalUrl || null,
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('voice pipeline error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'pipeline_failed' },
      { status: 500 }
    )
  }
}
