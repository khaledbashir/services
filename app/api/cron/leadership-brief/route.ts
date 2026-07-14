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

    const { entries, ok } = await summariseForLeadership(ships)
    const published = await publishEntries(entries)

    // Only retire the batch when the summariser actually ran. A failed model
    // call must leave the work queued — silently marking it published is how
    // shipped work goes missing from the exec feed forever.
    if (ok) {
      await markConsumed(ships)
    }

    console.info('[leadership-brief]', JSON.stringify({
      ships: ships.length,
      published,
      summariserOk: ok,
    }))
    return NextResponse.json({ ok, ships: ships.length, published })
  } catch (err) {
    console.error('Leadership brief cron error:', err)
    return NextResponse.json({ error: 'Failed to build leadership brief' }, { status: 500 })
  }
}
