import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

// Webhook receiver: when a proposal is won in rag2, auto-create the venue/service account
export async function POST(request: NextRequest) {
  try {
    const webhook_secret = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
    const authHeader = request.headers.get('x-webhook-secret')

    if (authHeader !== webhook_secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, proposal } = body

    if (action !== 'proposal_signed' && action !== 'proposal_closed') {
      return NextResponse.json({ ok: true, message: 'Ignored — not a won deal' })
    }

    if (!proposal?.clientName || !proposal?.venue) {
      return NextResponse.json({ error: 'Missing client or venue data' }, { status: 400 })
    }

    // Check if venue already exists
    const existingVenue = await query(
      `SELECT id FROM venues WHERE name ILIKE $1`,
      [proposal.venue]
    )

    let venueId: string

    if (existingVenue.rows.length > 0) {
      venueId = existingVenue.rows[0].id
    } else {
      // Find or create market
      let marketId: string | null = null
      if (proposal.city || proposal.state) {
        const marketName = proposal.state || proposal.city || 'Unknown'
        const marketResult = await query(
          `INSERT INTO markets (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id`,
          [marketName]
        )
        marketId = marketResult.rows[0].id
      }

      // Create venue
      const venueResult = await query(
        `INSERT INTO venues (name, market_id, address, primary_contact_name, primary_contact_email, portal_token)
         VALUES ($1, $2, $3, $4, $5, encode(gen_random_bytes(16), 'hex'))
         RETURNING id, portal_token`,
        [
          proposal.venue,
          marketId,
          proposal.address || null,
          proposal.contactName || null,
          proposal.contactEmail || null,
        ]
      )

      venueId = venueResult.rows[0].id

      // If service types exist, enable "Full Service" by default
      const fullServiceResult = await query(
        `SELECT id FROM service_types WHERE name = 'Full Service' LIMIT 1`
      )
      if (fullServiceResult.rows.length > 0) {
        await query(
          `INSERT INTO venue_services (venue_id, service_type_id, enabled) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
          [venueId, fullServiceResult.rows[0].id]
        )
      }
    }

    // Notify #external--ai-services
    const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || ''
    if (DEFAULT_CHANNEL) {
      sendSlackMessage({
        channel: DEFAULT_CHANNEL,
        text: `:tada: Deal Won! ${proposal.clientName} — ${proposal.venue}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:tada: *Deal Won — New Service Account*\n*Client:* ${proposal.clientName}\n*Venue:* ${proposal.venue}\n${proposal.city ? `*Location:* ${proposal.city}, ${proposal.state || ''}\n` : ''}${existingVenue.rows.length > 0 ? '_Venue already existed in the system_' : '_New venue created with portal link_'}`,
            },
          },
        ],
      })
    }

    return NextResponse.json({
      ok: true,
      venueId,
      isNew: existingVenue.rows.length === 0,
      message: existingVenue.rows.length > 0
        ? `Venue "${proposal.venue}" already exists`
        : `New venue "${proposal.venue}" created with service account`,
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
