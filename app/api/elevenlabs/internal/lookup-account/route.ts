export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import {
  twentyClient,
  type TwentyCompany,
  type TwentyOpportunity,
  type TwentyVenue,
} from '@/lib/twenty-client'
import {
  authorizeVoiceCall,
  cleanQuery,
  compactDate,
  containsFilter,
  moneyLabel,
} from '@/lib/elevenlabs-internal-auth'

type Match =
  | { type: 'company'; record: TwentyCompany }
  | { type: 'venue'; record: TwentyVenue }

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreMatch(query: string, match: Match): number {
  const wanted = normalizeName(query)
  const name = normalizeName(match.record.name)
  if (name === wanted) return 100
  if (name.startsWith(wanted)) return 90
  if (name.includes(wanted)) return 75
  if (wanted.includes(name)) return 65
  return 10
}

function isOpenOpp(opp: TwentyOpportunity): boolean {
  const status = String(opp.bidStatus || opp.stage || '').toUpperCase()
  return !['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED'].includes(status)
}

async function findBestMatch(query: string): Promise<Match | null> {
  const [companies, venues] = await Promise.all([
    twentyClient.getCompanies(containsFilter('name', query)),
    twentyClient.getVenues(containsFilter('name', query)),
  ])
  const matches: Match[] = [
    ...companies.slice(0, 8).map((r): Match => ({ type: 'company', record: r })),
    ...venues.slice(0, 8).map((r): Match => ({ type: 'venue', record: r })),
  ]
  return matches.sort((a, b) => scoreMatch(query, b) - scoreMatch(query, a))[0] || null
}

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const query = cleanQuery(
    request.nextUrl.searchParams.get('query') ||
      request.nextUrl.searchParams.get('account') ||
      request.nextUrl.searchParams.get('client_name')
  )
  if (!query) {
    return NextResponse.json({ ok: false, error: 'query_required' }, { status: 400 })
  }

  try {
    const match = await findBestMatch(query)
    if (!match) {
      return NextResponse.json({
        ok: true,
        found: false,
        query,
        voiceBrief: `I could not find a CRM account matching ${query}. Try the company, venue, or team name.`,
      })
    }

    const isCompany = match.type === 'company'
    const companyId = isCompany ? match.record.id : (match.record as TwentyVenue).companyId
    const venueId = !isCompany ? match.record.id : null

    const [company, venuesAll, oppsAll, services] = await Promise.all([
      isCompany ? Promise.resolve(match.record as TwentyCompany) : (companyId ? twentyClient.getCompany(companyId) : Promise.resolve(null)),
      companyId ? twentyClient.getVenues(`companyId[eq]:"${companyId}"`) : Promise.resolve(venueId ? [match.record as TwentyVenue] : []),
      companyId
        ? twentyClient.getOpportunities(`companyId[eq]:"${companyId}"`)
        : (venueId ? twentyClient.getOpportunities(`venueId[eq]:"${venueId}"`) : Promise.resolve([])),
      companyId
        ? twentyClient.getServices(`companyId[eq]:"${companyId}"`)
        : (venueId ? twentyClient.getServices(`venueId[eq]:"${venueId}"`) : Promise.resolve([])),
    ])

    const opps = oppsAll.sort((a, b) =>
      String(b.closeDate || b.createdAt || '').localeCompare(String(a.closeDate || a.createdAt || ''))
    )
    const openOpps = opps.filter(isOpenOpp)
    const wonOpps = opps.filter(o => String(o.bidStatus || '').toUpperCase() === 'WON')
    const activeServices = services.filter(s => String(s.serviceStatus || '').toUpperCase() !== 'INACTIVE')
    const activeServiceTypes = Array.from(new Set(activeServices.map(s => s.serviceType).filter(Boolean))).slice(0, 6)
    const monthlyRecurring = activeServices.reduce((sum, s) => sum + (s.monthlyValue?.amountMicros || 0), 0)
    const recurringLabel = monthlyRecurring
      ? moneyLabel({ amountMicros: monthlyRecurring, currencyCode: 'USD' })
      : null

    const accountName = company?.name || (match.record as TwentyVenue).name
    const venueNames = venuesAll.map(v => v.name).filter(Boolean).slice(0, 6)

    const recentOpenOpps = openOpps.slice(0, 5).map(o => ({
      id: o.id,
      name: o.name,
      stage: o.bidStatus || o.stage || null,
      amount: moneyLabel(o.amount),
      closeDate: compactDate(o.closeDate),
    }))

    const voiceBrief = [
      `Found ${accountName}.`,
      company?.league ? `League ${company.league}.` : null,
      company?.region ? `Region ${company.region}.` : null,
      company?.serviceStatus ? `Service status ${company.serviceStatus}.` : null,
      `${openOpps.length} open ${openOpps.length === 1 ? 'opportunity' : 'opportunities'}, ${wonOpps.length} won.`,
      recurringLabel ? `Active services run about ${recurringLabel} per month.` : null,
      venueNames.length ? `Venues: ${venueNames.slice(0, 3).join(', ')}.` : null,
      recentOpenOpps[0]
        ? `Most recent open opportunity: ${recentOpenOpps[0].name}${recentOpenOpps[0].amount ? ` at ${recentOpenOpps[0].amount}` : ''}.`
        : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      matchType: match.type,
      query,
      caller: auth.staff?.fullName || null,
      account: company
        ? {
            id: company.id,
            name: company.name,
            league: company.league || null,
            region: company.region || null,
            serviceStatus: company.serviceStatus || null,
            partnerType: company.partnerType || null,
            contractStart: compactDate(company.contractStart),
            contractEnd: compactDate(company.contractEnd),
            annualContractValue: moneyLabel(company.annualContractValue),
          }
        : null,
      venue: !isCompany
        ? {
            id: (match.record as TwentyVenue).id,
            name: (match.record as TwentyVenue).name,
            market: (match.record as TwentyVenue).market || null,
            status: (match.record as TwentyVenue).venueStatus || null,
          }
        : null,
      counts: {
        relatedVenues: venuesAll.length,
        openOpportunities: openOpps.length,
        wonOpportunities: wonOpps.length,
        activeServices: activeServices.length,
      },
      activeServiceTypes,
      monthlyRecurring: recurringLabel,
      recentOpenOpportunities: recentOpenOpps,
      relatedVenues: venueNames,
      voiceBrief,
    })
  } catch (error) {
    console.error('voice lookup-account error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'lookup_failed' },
      { status: 500 }
    )
  }
}
