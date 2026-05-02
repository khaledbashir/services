import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery, compactDate, moneyLabel } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveCompany, resolveVenue } from '@/lib/elevenlabs-crm-resolve'

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

  const name = cleanQuery(typeof body.name === 'string' ? body.name : '', 200)
  const companyQuery = cleanQuery(typeof body.company === 'string' ? body.company : '', 120)
  const venueQuery = cleanQuery(typeof body.venue === 'string' ? body.venue : '', 120)
  const stage = cleanQuery(typeof body.stage === 'string' ? body.stage : '', 60).toUpperCase() || undefined
  const closeDate = cleanQuery(typeof body.close_date === 'string' ? body.close_date : '', 20) || undefined
  const amount = typeof body.amount === 'number' ? body.amount : (typeof body.amount === 'string' ? Number(body.amount) || undefined : undefined)
  const currency = cleanQuery(typeof body.currency === 'string' ? body.currency : '', 8) || 'USD'

  if (!name) {
    return NextResponse.json({ ok: false, error: 'name_required', voiceBrief: 'I need a name for the opportunity.' }, { status: 400 })
  }

  try {
    let companyId: string | undefined
    let companyName: string | undefined
    if (companyQuery) {
      const co = await resolveCompany(companyQuery)
      if (!co) {
        return NextResponse.json({
          ok: false,
          error: 'company_not_found',
          voiceBrief: `I could not match a company named "${companyQuery}". Confirm the company name and try again.`,
        }, { status: 404 })
      }
      companyId = co.id
      companyName = co.record.name
    }

    let venueId: string | undefined
    let venueName: string | undefined
    if (venueQuery) {
      const ven = await resolveVenue(venueQuery)
      if (ven) {
        venueId = ven.id
        venueName = ven.record.name
      }
    }

    const opp = await twentyClient.createOpportunity({
      name,
      companyId,
      venueId,
      stage,
      amount,
      currency,
      closeDate,
    })

    const voiceBrief = [
      `Opportunity "${name}" created`,
      companyName ? `for ${companyName}` : null,
      venueName ? `at ${venueName}` : null,
      typeof amount === 'number' ? `worth ${moneyLabel({ amountMicros: amount * 1_000_000, currencyCode: currency })}` : null,
      closeDate ? `closing ${compactDate(closeDate)}` : null,
    ].filter(Boolean).join(' ') + '.'

    return NextResponse.json({
      ok: true,
      created: true,
      opportunity: { id: opp.id, name: opp.name },
      company: companyName ? { id: companyId, name: companyName } : null,
      venue: venueName ? { id: venueId, name: venueName } : null,
      voiceBrief,
    })
  } catch (error) {
    console.error('crm create-opportunity:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
