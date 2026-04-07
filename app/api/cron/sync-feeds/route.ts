import { NextResponse } from 'next/server'
import { getFeedSyncVenues, syncVenueFeed } from '@/lib/feed-sync'

export async function GET() {
  try {
    const venues = await getFeedSyncVenues()
    if (venues.length === 0) {
      return NextResponse.json({
        message: 'No venues configured with feed URLs',
        venue_count: 0,
        discovered: 0,
        imported: 0,
      })
    }

    const results = []
    for (const venue of venues) {
      results.push(await syncVenueFeed(venue))
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      venue_count: venues.length,
      discovered: results.reduce((sum, result) => sum + result.discovered.length, 0),
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      partial: results.filter((result) => result.status === 'partial').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results: results.map((result) => ({
        venue_id: result.venue.id,
        venue_name: result.venue.name,
        feed_type: result.venue.feed_type,
        discovered: result.discovered.length,
        imported: result.imported,
        status: result.status,
        error: result.error || null,
      })),
    })
  } catch (err) {
    console.error('Feed sync cron error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Feed sync failed' }, { status: 500 })
  }
}
