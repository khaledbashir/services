export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { runPhotoSweep } from '@/lib/slack-photo-sweep'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // A full-fleet sweep is paced under Slack's rate limit and runs for
  // minutes — longer than the reverse proxy allows a response to hang.
  // Fire-and-forget: results land in slack_photo_files and the ops-channel
  // summary; failures log server-side.
  void runPhotoSweep({}).then(
    report => console.log('[photo-sweep] done', JSON.stringify({
      ok: report.ok, filed: report.filed, imagesFound: report.imagesFound,
      skippedDuplicates: report.skippedDuplicates, errors: report.errors.length,
    })),
    err => console.error('[photo-sweep] failed', err),
  )
  return NextResponse.json({ started: true }, { status: 202 })
}

export async function GET(request: NextRequest) {
  const { requireRole, isAuthError } = await import('@/lib/rbac')
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const requestedDays = Number.parseInt(url.searchParams.get('days') || '7', 10)
  const days = Math.min(31, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 7))
  const venue = url.searchParams.get('venue') || undefined
  // A full-fleet run holds the connection for minutes — longer than the
  // reverse proxy tolerates. ?async=1 detaches it: 202 now, full report to
  // the server log (visible in container logs).
  if (url.searchParams.get('async') === '1') {
    void runPhotoSweep({ dry, days, venue }).then(
      report => console.log('[photo-sweep] report', JSON.stringify(report)),
      err => console.error('[photo-sweep] failed', err),
    )
    return NextResponse.json({ started: true, dry, days, venue: venue || null }, { status: 202 })
  }
  const results = await runPhotoSweep({ dry, days, venue })
  return NextResponse.json(results)
}
