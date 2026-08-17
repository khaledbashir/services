export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { runLowStockSweep } from '@/lib/inventory-alerts'

/**
 * Daily low-stock sweep — Joe 2026-08-17, "prompt us when we start to run low".
 *
 * Scheduler (root crontab):
 *   0 12 * * * curl -s 'https://services.ancsports.net/api/cron/inventory-low-stock'
 *   (8am ET)
 *
 * ?dry=1 reports what it would send without alerting or recording anything,
 * which is how to check the list before the first real run.
 */
export async function GET(request: NextRequest) {
  try {
    const dryRun = request.nextUrl.searchParams.get('dry') === '1'
    const result = await runLowStockSweep({ dryRun })
    return NextResponse.json({ ok: true, dry_run: dryRun, ...result })
  } catch (err) {
    console.error('Error in inventory low-stock sweep:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
