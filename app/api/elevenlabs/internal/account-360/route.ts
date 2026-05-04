import { NextRequest, NextResponse } from 'next/server'
import { twentyClient, type TwentyCompany, type TwentyVenue } from '@/lib/twenty-client'
import { query as dbQuery } from '@/lib/db'
import {
  authorizeVoiceCall,
  cleanQuery,
  compactDate,
  containsFilter,
  moneyLabel,
} from '@/lib/elevenlabs-internal-auth'

// One-call deep dive on an account: company, venues, services, opps, tickets,
// contract dates. The voiceBrief is a 30-second executive summary the agent
// reads aloud. The structured payload is there if the agent needs to follow up.

type Match =
  | { type: 'company'; record: TwentyCompany }
  | { type: 'venue'; record: TwentyVenue }

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function score(query: string, match: Match): number {
  const q = normalize(query)
  const n = normalize(match.record.name)
  if (n === q) return 100
  if (n.startsWith(q)) return 90
  if (n.includes(q)) return 75
  if (q.includes(n)) return 65
  return 10
}

async function findBest(query: string): Promise<Match | null> {
  const [companies, venues] = await Promise.all([
    twentyClient.getCompanies(containsFilter('name', query)),
    twentyClient.getVenues(containsFilter('name', query)),
  ])
  const candidates: Match[] = [
    ...companies.slice(0, 8).map((r): Match => ({ type: 'company', record: r })),
    ...venues.slice(0, 8).map((r): Match => ({ type: 'venue', record: r })),
  ]
  return candidates.sort((a, b) => score(query, b) - score(query, a))[0] || null
}

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const q = cleanQuery(request.nextUrl.searchParams.get('query') || request.nextUrl.searchParams.get('account'))
  if (!q) return NextResponse.json({ ok: false, error: 'query_required' }, { status: 400 })

  try {
    const match = await findBest(q)
    if (!match) {
      return NextResponse.json({
        ok: true,
        found: false,
        query: q,
        voiceBrief: `I could not find an account matching ${q}.`,
      })
    }

    const isCompany = match.type === 'company'
    const companyId = isCompany ? match.record.id : (match.record as TwentyVenue).companyId

    const [company, venues, opps, services, peopleAtCo] = await Promise.all([
      isCompany ? Promise.resolve(match.record as TwentyCompany) : (companyId ? twentyClient.getCompany(companyId) : Promise.resolve(null)),
      companyId ? twentyClient.getVenues(`companyId[eq]:"${companyId}"`) : Promise.resolve(isCompany ? [] : [match.record as TwentyVenue]),
      companyId ? twentyClient.getOpportunities(`companyId[eq]:"${companyId}"`) : Promise.resolve([]),
      companyId ? twentyClient.getServices(`companyId[eq]:"${companyId}"`) : Promise.resolve([]),
      companyId ? twentyClient.getPeople(`companyId[eq]:"${companyId}"`) : Promise.resolve([]),
    ])

    const ticketRows = venues.length
      ? await dbQuery(
          `SELECT t.ticket_number, t.title, t.status, t.priority,
                  v.name as venue_name,
                  TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD') as created_short,
                  t.sla_resolution_due,
                  CASE WHEN t.sla_resolution_due IS NOT NULL AND t.sla_resolution_due < NOW() AND t.status NOT IN ('closed','cancelled') THEN true ELSE false END as breached
           FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
           WHERE LOWER(v.name) = ANY($1::text[])
             AND t.status NOT IN ('closed','cancelled')
           ORDER BY t.created_at DESC
           LIMIT 8`,
          [venues.map(v => v.name.toLowerCase())]
        )
      : { rows: [] }

    const closedClosers = ['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED']
    const openOpps = opps.filter(o => !closedClosers.includes(String(o.bidStatus || o.stage || '').toUpperCase()))
    const wonOpps = opps.filter(o => String(o.bidStatus || '').toUpperCase() === 'WON')
    const activeServices = services.filter(s => String(s.serviceStatus || '').toUpperCase() !== 'INACTIVE')
    const monthlyMicros = activeServices.reduce((sum, s) => sum + (s.monthlyValue?.amountMicros || 0), 0)
    const monthly = monthlyMicros ? moneyLabel({ amountMicros: monthlyMicros, currencyCode: 'USD' }) : null
    const annual = monthlyMicros ? moneyLabel({ amountMicros: monthlyMicros * 12, currencyCode: 'USD' }) : null

    const contacts = peopleAtCo.filter(p => !p.isAncStaff).slice(0, 3).map(p => ({
      name: `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.trim(),
      role: (p as { jobTitle?: string }).jobTitle || null,
      email: p.emails?.primaryEmail || null,
    }))

    const breached = ticketRows.rows.filter(r => r.breached).length
    const accountName = company?.name || (match.record as TwentyVenue).name

    const voiceBrief = [
      `${accountName}.`,
      company?.league ? `${company.league}.` : null,
      company?.contractEnd ? `Contract through ${compactDate(company.contractEnd)}.` : null,
      activeServices.length ? `${activeServices.length} active services${monthly ? ` worth ${monthly} per month, ${annual} a year` : ''}.` : 'No active services on file.',
      openOpps.length ? `${openOpps.length} open ${openOpps.length === 1 ? 'opportunity' : 'opportunities'}` + (wonOpps.length ? `, ${wonOpps.length} won historically` : '') + '.' : null,
      ticketRows.rows.length ? `${ticketRows.rows.length} open ticket${ticketRows.rows.length === 1 ? '' : 's'}` + (breached ? `, ${breached} past SLA — needs attention` : '') + '.' : 'No open tickets.',
      openOpps[0] ? `Top open: ${openOpps[0].name}${openOpps[0].amount ? ` at ${moneyLabel(openOpps[0].amount)}` : ''}.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      query: q,
      account: company ? {
        id: company.id,
        name: company.name,
        league: company.league || null,
        region: company.region || null,
        serviceStatus: company.serviceStatus || null,
        contractStart: compactDate(company.contractStart),
        contractEnd: compactDate(company.contractEnd),
        annualContractValue: moneyLabel(company.annualContractValue),
      } : null,
      venues: venues.slice(0, 6).map(v => ({
        id: v.id,
        name: v.name,
        market: v.market || null,
        status: v.venueStatus || null,
      })),
      services: {
        activeCount: activeServices.length,
        monthlyRecurring: monthly,
        annualRecurring: annual,
        types: Array.from(new Set(activeServices.map(s => s.serviceType).filter(Boolean))).slice(0, 5),
      },
      opportunities: {
        openCount: openOpps.length,
        wonCount: wonOpps.length,
        topOpen: openOpps.slice(0, 3).map(o => ({
          id: o.id,
          name: o.name,
          stage: o.bidStatus || o.stage || null,
          amount: moneyLabel(o.amount),
          closeDate: compactDate(o.closeDate),
        })),
      },
      tickets: {
        openCount: ticketRows.rows.length,
        breachedCount: breached,
        recent: ticketRows.rows.slice(0, 5).map(r => ({
          ticketNumber: r.ticket_number,
          title: r.title,
          status: r.status,
          priority: r.priority,
          venue: r.venue_name,
          breached: r.breached,
        })),
      },
      keyContacts: contacts,
      voiceBrief,
    })
  } catch (error) {
    console.error('voice account-360:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'lookup_failed' },
      { status: 500 }
    )
  }
}
