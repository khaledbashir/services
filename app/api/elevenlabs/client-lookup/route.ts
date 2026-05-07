export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import {
  twentyClient,
  type TwentyCompany,
  type TwentyOpportunity,
  type TwentyService,
  type TwentyVenue,
} from '@/lib/twenty-client'

type Match =
  | { type: 'company'; record: TwentyCompany }
  | { type: 'venue'; record: TwentyVenue }

function authorized(request: NextRequest): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET
  if (!secret) return false

  const webhookSecret = request.headers.get('x-webhook-secret')
  const bearer = request.headers.get('authorization')
  if (webhookSecret === secret || bearer === `Bearer ${secret}`) return true

  // ElevenLabs Secret headers can be easy to misconfigure: the selected
  // secret may become the header value while the secret label becomes the
  // header name. Accept the shared secret value regardless of header name.
  for (const [, value] of request.headers.entries()) {
    if (value === secret || value === `Bearer ${secret}`) return true
  }

  return false
}

function cleanQuery(value: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function containsFilter(field: string, value: string): string {
  const safeValue = encodeURIComponent(value.replace(/"/g, '').replace(/%/g, ''))
  return `${field}[ilike]:"%25${safeValue}%25"`
}

function moneyLabel(value?: { amountMicros: number; currencyCode: string }): string | null {
  if (!value || typeof value.amountMicros !== 'number') return null
  const amount = value.amountMicros / 1_000_000
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: value.currencyCode || 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function compactDate(value?: string): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

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

function sortByRecent(a: TwentyOpportunity, b: TwentyOpportunity): number {
  return String(b.closeDate || b.createdAt || '').localeCompare(String(a.closeDate || a.createdAt || ''))
}

function isOpenOpportunity(opp: TwentyOpportunity): boolean {
  const status = String(opp.bidStatus || opp.stage || '').toUpperCase()
  return !['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED'].includes(status)
}

function opportunitySummary(opp: TwentyOpportunity, includeFinancials: boolean) {
  return {
    id: opp.id,
    name: opp.name,
    status: opp.bidStatus || opp.stage || null,
    closeDate: compactDate(opp.closeDate),
    amount: includeFinancials ? moneyLabel(opp.amount) : undefined,
    proposalUrl: opp.proposalUrl || null,
  }
}

async function findBestMatch(query: string): Promise<Match | null> {
  const [companies, venues] = await Promise.all([
    twentyClient.getCompanies(containsFilter('name', query)),
    twentyClient.getVenues(containsFilter('name', query)),
  ])

  const matches: Match[] = [
    ...companies.slice(0, 8).map((record): Match => ({ type: 'company', record })),
    ...venues.slice(0, 8).map((record): Match => ({ type: 'venue', record })),
  ]

  return matches.sort((a, b) => scoreMatch(query, b) - scoreMatch(query, a))[0] || null
}

async function getRelatedData(match: Match) {
  if (match.type === 'company') {
    const companyId = match.record.id
    const [venues, opportunities, services] = await Promise.all([
      twentyClient.getVenues(`companyId[eq]:"${companyId}"`),
      twentyClient.getOpportunities(`companyId[eq]:"${companyId}"`),
      twentyClient.getServices(`companyId[eq]:"${companyId}"`),
    ])

    return { company: match.record, venue: null, venues, opportunities, services }
  }

  const venue = match.record
  const [company, venueOpportunities, venueServices] = await Promise.all([
    venue.companyId ? twentyClient.getCompany(venue.companyId) : Promise.resolve(null),
    twentyClient.getOpportunities(`venueId[eq]:"${venue.id}"`),
    twentyClient.getServices(`venueId[eq]:"${venue.id}"`),
  ])

  const companyOpportunities = company?.id
    ? await twentyClient.getOpportunities(`companyId[eq]:"${company.id}"`)
    : []

  const opportunitiesById = new Map<string, TwentyOpportunity>()
  for (const opp of [...venueOpportunities, ...companyOpportunities]) {
    opportunitiesById.set(opp.id, opp)
  }

  return {
    company,
    venue,
    venues: [venue],
    opportunities: Array.from(opportunitiesById.values()),
    services: venueServices,
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const query = cleanQuery(
    request.nextUrl.searchParams.get('client_name') ||
      request.nextUrl.searchParams.get('query') ||
      request.nextUrl.searchParams.get('account')
  )
  const mode = request.nextUrl.searchParams.get('mode') || 'client_safe'
  const includeFinancials = mode === 'internal_demo'

  if (!query) {
    return NextResponse.json({ ok: false, error: 'client_name_required' }, { status: 400 })
  }

  try {
    const match = await findBestMatch(query)
    if (!match) {
      return NextResponse.json({
        ok: true,
        found: false,
        query,
        voiceBrief: `I could not find a confident CRM match for ${query}. I can still capture the request and route it to ANC with that account name.`,
        nextBestAction: 'Ask for the company, venue, team name, or contact email to narrow the lookup.',
      })
    }

    const related = await getRelatedData(match)
    const opportunities = related.opportunities.sort(sortByRecent)
    const openOpportunities = opportunities.filter(isOpenOpportunity)
    const wonOpportunities = opportunities.filter(opp => String(opp.bidStatus || '').toUpperCase() === 'WON')
    const recentOpportunities = opportunities.slice(0, 5).map(opp => opportunitySummary(opp, includeFinancials))
    const activeServices = related.services.filter(svc => String(svc.serviceStatus || '').toUpperCase() !== 'INACTIVE')

    const accountName = related.company?.name || related.venue?.name || match.record.name
    const venueNames = related.venues.map(venue => venue.name).filter(Boolean).slice(0, 5)
    const serviceTypes = Array.from(new Set(activeServices.map(svc => svc.serviceType).filter(Boolean))).slice(0, 5)

    const contextParts = [
      match.type === 'venue' ? 'venue match' : 'company match',
      related.company?.league ? `league: ${related.company.league}` : null,
      related.company?.region ? `region: ${related.company.region}` : null,
      related.company?.serviceStatus ? `service status: ${related.company.serviceStatus}` : null,
      serviceTypes.length ? `active service areas: ${serviceTypes.join(', ')}` : null,
    ].filter(Boolean)

    const voiceBrief = [
      `I found ${accountName}.`,
      contextParts.length ? `CRM context: ${contextParts.join('; ')}.` : null,
      `${openOpportunities.length} open opportunity${openOpportunities.length === 1 ? '' : 'ies'}, ${wonOpportunities.length} won opportunity${wonOpportunities.length === 1 ? '' : 'ies'} in the related CRM history.`,
      venueNames.length ? `Related venue${venueNames.length === 1 ? '' : 's'}: ${venueNames.join(', ')}.` : null,
      'The useful next step is to confirm whether this is about a new project, an existing proposal, service support, or sponsorship/reporting.',
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      query,
      mode,
      matchType: match.type,
      account: related.company
        ? {
            id: related.company.id,
            name: related.company.name,
            league: related.company.league || null,
            region: related.company.region || null,
            serviceStatus: related.company.serviceStatus || null,
            partnerType: related.company.partnerType || null,
            contractEnd: compactDate(related.company.contractEnd),
          }
        : null,
      venue: related.venue
        ? {
            id: related.venue.id,
            name: related.venue.name,
            market: related.venue.market || null,
            status: related.venue.venueStatus || null,
          }
        : null,
      counts: {
        relatedVenues: related.venues.length,
        openOpportunities: openOpportunities.length,
        wonOpportunities: wonOpportunities.length,
        activeServices: activeServices.length,
      },
      relatedVenues: venueNames,
      activeServiceTypes: serviceTypes,
      recentOpportunities,
      voiceBrief,
      nextBestAction: 'Ask whether the caller needs a new project intake, proposal follow-up, service support, or sponsorship/reporting help.',
      disclosureRule: includeFinancials
        ? 'Internal demo mode: financial amounts may be summarized if present, but do not reveal margins, costs, markup, or private notes.'
        : 'Client-safe mode: do not reveal amounts, margins, costs, markup, private notes, or internal profitability.',
    })
  } catch (error) {
    console.error('ElevenLabs client lookup error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'client_lookup_failed' },
      { status: 500 }
    )
  }
}
