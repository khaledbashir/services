export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { DiscoveryCandidate, discoverAcrossVenues, discoverForVenue, getActiveDiscoveryVenues, getDiscoveryVenue, importDiscoveryEvents } from '@/lib/event-discovery'
import { writeDiscoveryLogs } from '@/lib/discovery-log'

const SLACK_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || ''

function isAutoImportCandidate(event: DiscoveryCandidate): boolean {
  return !event.duplicate && event.auto_importable && event.match_type === 'official_source'
}

async function logRun(details: Record<string, unknown>) {
  await query(
    `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
     VALUES ('event_discovery_run', 'system', NULL, NULL, $1)`,
    [JSON.stringify(details)]
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')
    const venueName = searchParams.get('venue')
    const preview = searchParams.get('preview') === 'true'

    if (venueId || venueName) {
      let venue = null
      if (venueId) {
        venue = await getDiscoveryVenue(venueId)
      } else if (venueName) {
        const venues = await getActiveDiscoveryVenues()
        venue = venues.find(candidate => candidate.name.toLowerCase().includes(venueName.toLowerCase())) || null
      }

      if (!venue) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
      }
      if (venue.active_service_count <= 0) {
        return NextResponse.json({
          message: `Skipping ${venue.name}: no active contracted services`,
          imported: 0,
          pending_review: 0,
          mode: preview ? 'preview' : 'cron',
        })
      }

      const result = await discoverForVenue(venue)
      const autoImportable = result.discovered.filter(isAutoImportCandidate)
      const pendingReview = result.discovered.filter(event => !event.duplicate && !isAutoImportCandidate(event))

      if (!preview && autoImportable.length > 0) {
        const imported = await importDiscoveryEvents({
          defaultVenueId: venue.id,
          events: autoImportable,
          status: 'imported',
        })

        await logRun({
          scope: 'single_venue',
          venue_id: venue.id,
          venue_name: venue.name,
          discovered: result.discovered.length,
          duplicates: result.discovered.filter(event => event.duplicate).length,
          auto_imported: imported.imported,
          pending_review: pendingReview.length,
        })

        await writeDiscoveryLogs({ result, importedByVenue: imported.byVenue })
      } else {
        await writeDiscoveryLogs({ result })
      }

      return NextResponse.json({
        ...result,
        auto_importable: autoImportable.length,
        pending_review: pendingReview.length,
        mode: preview ? 'preview' : 'cron',
      })
    }

    const venues = await getActiveDiscoveryVenues()
    if (venues.length === 0) {
      return NextResponse.json({ message: 'No active discovery venues', imported: 0, pending_review: 0 })
    }

    const result = await discoverAcrossVenues(venues)
    const autoImportable = result.discovered.filter(isAutoImportCandidate)
    const pendingReview = result.discovered.filter(event => !event.duplicate && !isAutoImportCandidate(event))

    let imported = { imported: 0, skipped: 0, eventIds: [] as string[], byVenue: {} as Record<string, number> }
    if (!preview && autoImportable.length > 0) {
      imported = await importDiscoveryEvents({
        events: autoImportable,
        status: 'imported',
      })
    }

    const summary = {
      venue_count: venues.length,
      discovered: result.discovered.length,
      duplicates: result.discovered.filter(event => event.duplicate).length,
      auto_imported: imported.imported,
      pending_review: pendingReview.length,
      imported_by_venue: imported.byVenue,
    }

    await logRun(summary)
    await writeDiscoveryLogs({ result, importedByVenue: imported.byVenue })

    if (!preview && SLACK_CHANNEL) {
      await sendSlackMessage({
        channel: SLACK_CHANNEL,
        text: `Discovered ${result.discovered.length} new events across ${venues.length} venues. ${imported.imported} imported automatically, ${pendingReview.length} pending review.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:mag: *Event Discovery Summary*\nDiscovered *${result.discovered.length}* candidate events across *${venues.length}* venues.\n*${imported.imported}* imported automatically, *${pendingReview.length}* pending review.`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: venues
                .slice(0, 8)
                .map(venue => {
                  const venueImported = imported.byVenue[venue.id] || 0
                  const venuePending = pendingReview.filter(event => event.venue_id === venue.id).length
                  return `• *${venue.name}:* ${venueImported} imported, ${venuePending} pending`
                })
                .join('\n') || 'No venue-level results.',
            },
          },
        ],
      })
    }

    return NextResponse.json({
      ...summary,
      mode: preview ? 'preview' : 'cron',
      discovered: result.discovered,
      venues: result.venues,
    })
  } catch (err) {
    console.error('Auto-discovery cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
