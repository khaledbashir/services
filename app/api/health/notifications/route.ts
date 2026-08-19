import { NextRequest, NextResponse } from 'next/server'
import { notificationHealth } from '@/lib/notification-log'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Is the notification system actually working right now?
 *
 * Open it and read `healthy` — everything else is the evidence behind that one
 * word. Returns 503 when unhealthy so an uptime checker can watch it without
 * parsing the body.
 *
 * `?hours=` widens the window (default 24, max 720).
 */
export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('hours'))
  const hours = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 720) : 24

  try {
    const health = await notificationHealth(hours)
    return NextResponse.json(health, {
      status: health.healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[health/notifications] failed:', err)
    return NextResponse.json(
      { healthy: false, problems: ['The health check itself failed.'] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
