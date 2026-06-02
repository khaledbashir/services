import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import {
  findOrCreateTwentyCompany,
  findOrCreateTwentyVenue,
  createOrUpdateOpportunity,
  createServiceRecords,
  twentyFetch,
} from '@/lib/twenty-sync'

// Webhook receiver: when a proposal is won in rag2, create/update the service-side account.
// CRM record creation stays gated by default so proposal activity cannot create duplicate accounts/opportunities.
export async function POST(request: NextRequest) {
  try {
    const webhook_secret = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'
    const authHeader = request.headers.get('x-webhook-secret')

    if (authHeader !== webhook_secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, proposal, screens } = body

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
    }

    // Import installed screens
    if (screens && Array.isArray(screens) && screens.length > 0) {
      for (const screen of screens) {
        await query(
          `INSERT INTO venue_screens (venue_id, display_name, manufacturer, model, pixel_pitch, width_ft, height_ft, install_date, is_active, source_proposal_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [
            venueId,
            screen.displayName || screen.name || 'Display',
            screen.manufacturer || null,
            screen.modelNumber || screen.model || null,
            screen.pixelPitch || null,
            screen.widthFt || null,
            screen.heightFt || null,
            screen.installDate || null,
            screen.isActive !== false,
            proposal.id || null,
          ]
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

    // --- CRM Integration ---
    const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
    if (TWENTY_API_KEY) {
      const createMode = (process.env.TWENTY_PROPOSAL_WEBHOOK_CREATE_MODE || 'review').toLowerCase()
      if (createMode !== 'auto') {
        await query(
          `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
           VALUES ('twenty_crm_review_required', 'proposal', NULL, NULL, $1)`,
          [JSON.stringify({
            client: proposal.clientName,
            venue: proposal.venue,
            proposalId: proposal.id || null,
            reason: 'CRM company/opportunity creation is held for review to prevent duplicate records.',
          })]
        )

        return NextResponse.json({
          ok: true,
          venueId,
          isNew: existingVenue.rows.length === 0,
          crmReviewRequired: true,
          message: existingVenue.rows.length > 0
            ? `Venue "${proposal.venue}" already exists; CRM review required before creating or linking records`
            : `New venue "${proposal.venue}" created with service account; CRM review required before creating or linking records`,
        })
      }

      try {
        const twentyCompanyId = await findOrCreateTwentyCompany(proposal.clientName)
        const twentyVenueId = await findOrCreateTwentyVenue(proposal.venue, venueId, twentyCompanyId)

        const opportunityId = await createOrUpdateOpportunity({
          name: `${proposal.clientName} — ${proposal.venue}`,
          bidStatus: 'WON',
          stage: 'CUSTOMER',
          amount: proposal.totalAmount || undefined,
          proposalUrl: proposal.proposalUrl || undefined,
          ledSqFt: proposal.totalSqFt || undefined,
          manufacturer: proposal.manufacturer || undefined,
          companyId: twentyCompanyId,
          venueId: twentyVenueId,
        })

        await createServiceRecords(twentyVenueId, twentyCompanyId, ['LED_MAINTENANCE'])

        await twentyFetch(`companies/${twentyCompanyId}`, {
          method: 'PATCH',
          body: JSON.stringify({ serviceStatus: 'ACTIVE_INSTALL' }),
        })

        // Log to activity_log
        await query(
          `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
           VALUES ('twenty_opportunity_created', 'opportunity', NULL, NULL, $1)`,
          [JSON.stringify({
            client: proposal.clientName,
            venue: proposal.venue,
            twentyOpportunityId: opportunityId,
            twentyCompanyId,
            twentyVenueId,
          })]
        )
      } catch (err) {
        console.error('Twenty CRM integration error (non-fatal):', err)
      }
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
