export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { checkAndFireRetainerAlerts } from '@/lib/retainer-alerts'

/**
 * Cron-able / manual safety-net endpoint for retainer-cap alerts.
 *
 * Fires the 90% / 100% utilization emails to Joe + Charlie + Jireh
 * (cc Ahmad) the moment hours_used crosses each threshold. The library
 * is idempotent — already-fired (month, threshold) pairs are skipped via
 * the retainer_alerts unique constraint.
 *
 * Authoritative trigger is markShipped(); this route exists so a daily
 * cron can catch any case the inline trigger missed (manual SQL edits,
 * timezone edge cases, server downtime when a row landed via auto-push).
 *
 * Auth: shares CRON_SECRET pattern with /api/cron/reminders.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const results = await checkAndFireRetainerAlerts()
  return NextResponse.json({ ok: true, results })
}

// Allow GET for ad-hoc inspection in the browser when authenticated as admin.
export async function GET(request: NextRequest) {
  const { requireRole, isAuthError } = await import('@/lib/rbac')
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry') === '1'
  if (dryRun) {
    const { hoursThisMonth } = await import('@/lib/service-triage')
    const meter = await hoursThisMonth()
    const pct = meter.cap_hours > 0 ? (meter.hours_used / meter.cap_hours) * 100 : 0
    return NextResponse.json({ dry_run: true, meter, pct })
  }
  const results = await checkAndFireRetainerAlerts()
  return NextResponse.json({ ok: true, results })
}
