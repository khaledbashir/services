import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery, compactDate, moneyLabel } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveCompany, resolveVenue } from '@/lib/elevenlabs-crm-resolve'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const query = cleanQuery(
    request.nextUrl.searchParams.get('query') || request.nextUrl.searchParams.get('account')
  )
  if (!query) return NextResponse.json({ ok: false, error: 'query_required' }, { status: 400 })

  try {
    const co = await resolveCompany(query)
    const ven = co ? null : await resolveVenue(query)
    if (!co && !ven) {
      return NextResponse.json({
        ok: true,
        found: false,
        query,
        voiceBrief: `I could not find a CRM account matching ${query}. Try the company, venue, or team name.`,
      })
    }
    const companyId = co?.id || (ven?.record.companyId || null)
    const [opps, services] = await Promise.all([
      companyId ? twentyClient.getOpportunities(`companyId[eq]:"${companyId}"`) : Promise.resolve([]),
      companyId ? twentyClient.getServices(`companyId[eq]:"${companyId}"`) : Promise.resolve([]),
    ])
    const openOpps = opps.filter(o => {
      const s = String(o.bidStatus || o.stage || '').toUpperCase()
      return !['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED'].includes(s)
    })

    const accountName = co?.record.name || ven?.record.name || query
    const recent = openOpps.slice(0, 3).map(o => ({
      id: o.id,
      name: o.name,
      stage: o.bidStatus || o.stage || null,
      amount: moneyLabel(o.amount),
      closeDate: compactDate(o.closeDate),
    }))

    const voiceBrief = [
      `Found ${accountName}.`,
      co?.record.league ? `League ${co.record.league}.` : null,
      `${openOpps.length} open ${openOpps.length === 1 ? 'opportunity' : 'opportunities'}, ${services.length} active services on file.`,
      recent[0] ? `Most recent open: ${recent[0].name}${recent[0].amount ? ` at ${recent[0].amount}` : ''}.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      account: co
        ? {
            id: co.id,
            name: co.record.name,
            league: co.record.league || null,
            region: co.record.region || null,
            serviceStatus: co.record.serviceStatus || null,
            contractEnd: compactDate(co.record.contractEnd),
          }
        : null,
      venue: ven
        ? { id: ven.id, name: ven.record.name, market: ven.record.market || null }
        : null,
      counts: { openOpportunities: openOpps.length, activeServices: services.length },
      recentOpenOpportunities: recent,
      voiceBrief,
    })
  } catch (error) {
    console.error('crm lookup-account:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'lookup_failed' },
      { status: 500 }
    )
  }
}
