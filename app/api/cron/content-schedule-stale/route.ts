export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { ContentSchedule, isTwentyBackedEnabled } from '@/lib/twenty-ops'

/**
 * Auto-stale cron for Content Schedules.
 *
 * Runs nightly. Finds every content schedule where:
 *   - runEndDate < today
 *   - status = "content_live"
 * And sets status to "confirmed_live".
 *
 * Eliminates Alexis's manual date-change pain point.
 *
 * Trigger: GET /api/cron/content-schedule-stale (EasyPanel cron or external ping)
 * Gate: TWENTY_BACKED_CONTENT_SCHEDULES=1
 */

export async function GET() {
  if (!isTwentyBackedEnabled('CONTENT_SCHEDULES')) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'TWENTY_BACKED_CONTENT_SCHEDULES not enabled' })
  }

  const today = new Date().toISOString().slice(0, 10)
  let scanned = 0
  let updated = 0
  const errors: string[] = []

  try {
    // Find all content_live schedules that have a runEndDate in the past
    const filter = `status[eq]:"content_live",runEndDate[lt]:"${today}"`
    let cursor: string | null = null

    for (let page = 0; page < 20; page++) {
      const batch = await ContentSchedule.list({
        limit: 60,
        startingAfter: cursor || undefined,
        filter,
        orderBy: 'runEndDate[AscNullsLast]',
      })

      scanned += batch.items.length

      for (const cs of batch.items) {
        try {
          await ContentSchedule.update(cs.id, { status: 'confirmed_live' } as any)
          updated++
        } catch (err: any) {
          errors.push(`${cs.id}: ${err?.message || 'unknown error'}`)
        }
      }

      if (!batch.hasNextPage || !batch.nextCursor) break
      cursor = batch.nextCursor
    }

    return NextResponse.json({
      ok: true,
      scanned,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    console.error('[cron/content-schedule-stale] fatal:', err)
    return NextResponse.json(
      { ok: false, scanned, updated, error: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
