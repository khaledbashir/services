export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import {
  getUnpublishedShips,
  markConsumed,
  publishEntries,
  summariseForLeadership,
} from '@/lib/leadership-brief'

/**
 * GET /api/cron/leadership-brief
 *
 * Runs daily. Takes everything that shipped since the last run, rewrites it in
 * executive language, and publishes it to the Leadership hub's "What's new"
 * feed. Nobody has to write an update for it to appear.
 */
export async function GET() {
  try {
    const ships = await getUnpublishedShips()
    if (ships.length === 0) {
      return NextResponse.json({ ok: true, ships: 0, published: 0 })
    }

    const entries = await summariseForLeadership(ships)
    const published = await publishEntries(entries)

    // Mark everything in this batch, including work the model merged or judged
    // too internal to surface, so it isn't reconsidered every night.
    await markConsumed(ships)

    console.info('[leadership-brief]', JSON.stringify({
      ships: ships.length,
      published,
    }))
    return NextResponse.json({ ok: true, ships: ships.length, published })
  } catch (err) {
    console.error('Leadership brief cron error:', err)
    return NextResponse.json({ error: 'Failed to build leadership brief' }, { status: 500 })
  }
}
