export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { twentyClient, type TwentyVenue } from '@/lib/twenty-client'
import { query as dbQuery } from '@/lib/db'
import {
  authorizeVoiceCall,
  cleanQuery,
  compactDate,
  containsFilter,
  moneyLabel,
} from '@/lib/elevenlabs-internal-auth'

function score(query: string, name: string): number {
  const q = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (n === q) return 100
  if (n.startsWith(q)) return 90
  if (n.includes(q)) return 75
  return 10
}

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const q = cleanQuery(
    request.nextUrl.searchParams.get('query') || request.nextUrl.searchParams.get('venue')
  )
  if (!q) return NextResponse.json({ ok: false, error: 'query_required' }, { status: 400 })

  try {
    const matches = await twentyClient.getVenues(containsFilter('name', q))
    const venue: TwentyVenue | null = matches
      .slice()
      .sort((a, b) => score(q, b.name) - score(q, a.name))[0] || null

    if (!venue) {
      return NextResponse.json({
        ok: true,
        found: false,
        query: q,
        voiceBrief: `No venue match for ${q}.`,
      })
    }

    const [company, services, opps, localVenue] = await Promise.all([
      venue.companyId ? twentyClient.getCompany(venue.companyId) : Promise.resolve(null),
      twentyClient.getServices(`venueId[eq]:"${venue.id}"`),
      twentyClient.getOpportunities(`venueId[eq]:"${venue.id}"`),
      dbQuery(`SELECT id FROM venues WHERE LOWER(name) = LOWER($1) LIMIT 1`, [venue.name]),
    ])

    const localVenueId = localVenue.rows[0]?.id || null
    const tickets = localVenueId
      ? await dbQuery(
          `SELECT t.ticket_number, t.title, t.status, t.priority,
                  TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD') as created_short
           FROM tickets t
           WHERE t.venue_id = $1
             AND t.status NOT IN ('closed', 'cancelled')
           ORDER BY t.created_at DESC
           LIMIT 5`,
          [localVenueId]
        )
      : { rows: [] }

    const activeServices = services.filter(s => String(s.serviceStatus || '').toUpperCase() !== 'INACTIVE')
    const monthly = activeServices.reduce((sum, s) => sum + (s.monthlyValue?.amountMicros || 0), 0)
    const monthlyLabel = monthly ? moneyLabel({ amountMicros: monthly, currencyCode: 'USD' }) : null
    const openOpps = opps.filter(o => {
      const s = String(o.bidStatus || o.stage || '').toUpperCase()
      return !['WON', 'LOST', 'NO_BID', 'NO BID', 'CANCELLED', 'CANCELED'].includes(s)
    })

    const voiceBrief = [
      `Venue ${venue.name}.`,
      company ? `Operated by ${company.name}.` : null,
      venue.market ? `Market ${venue.market}.` : null,
      venue.venueStatus ? `Status ${venue.venueStatus}.` : null,
      activeServices.length
        ? `${activeServices.length} active ${activeServices.length === 1 ? 'service' : 'services'}${monthlyLabel ? ` worth ${monthlyLabel} per month` : ''}.`
        : 'No active contracted services on file.',
      openOpps.length ? `${openOpps.length} open ${openOpps.length === 1 ? 'opportunity' : 'opportunities'}.` : null,
      tickets.rows.length ? `${tickets.rows.length} open ticket${tickets.rows.length === 1 ? '' : 's'} in the queue.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      caller: auth.staff?.fullName || null,
      venue: {
        id: venue.id,
        name: venue.name,
        market: venue.market || null,
        status: venue.venueStatus || null,
        category: venue.venueCategory || null,
        hasContractedServices: venue.hasContractedServices ?? null,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            league: company.league || null,
            region: company.region || null,
            serviceStatus: company.serviceStatus || null,
            contractEnd: compactDate(company.contractEnd),
          }
        : null,
      activeServices: activeServices.slice(0, 8).map(s => ({
        name: s.name,
        type: s.serviceType,
        status: s.serviceStatus,
        monthly: moneyLabel(s.monthlyValue),
        startDate: compactDate(s.startDate),
        endDate: compactDate(s.endDate),
      })),
      monthlyServiceValue: monthlyLabel,
      openOpportunities: openOpps.slice(0, 5).map(o => ({
        name: o.name,
        stage: o.bidStatus || o.stage || null,
        amount: moneyLabel(o.amount),
        closeDate: compactDate(o.closeDate),
      })),
      openTickets: tickets.rows,
      voiceBrief,
    })
  } catch (error) {
    console.error('voice lookup-venue error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'lookup_failed' },
      { status: 500 }
    )
  }
}
