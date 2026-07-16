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
  const results = await runPhotoSweep({})
  return NextResponse.json(results)
}

export async function GET(request: NextRequest) {
  const { requireRole, isAuthError } = await import('@/lib/rbac')
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const requestedDays = Number.parseInt(url.searchParams.get('days') || '7', 10)
  const days = Math.min(31, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 7))
  const results = await runPhotoSweep({ dry, days })
  return NextResponse.json(results)
}
