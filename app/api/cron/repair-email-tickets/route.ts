export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { repairEmailTickets } from '@/lib/email-ticket-repair'

// Sweep email tickets whose CRM message body landed after the webhook fired:
// repairs subject-only original_message and inserts dropped reply comments.

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const requestedDays = Number.parseInt(url.searchParams.get('days') || '2', 10)
  const days = Math.min(3650, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 2))
  // A wide-lookback run holds the connection past what the reverse proxy
  // tolerates — detach and report to the server log.
  void repairEmailTickets({ days }).then(
    (report) => console.log('[email-ticket-repair] done', JSON.stringify(report)),
    (err) => console.error('[email-ticket-repair] failed', err)
  )
  return NextResponse.json({ started: true, days }, { status: 202 })
}

export async function GET(request: NextRequest) {
  const { requireRole, isAuthError } = await import('@/lib/rbac')
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const requestedDays = Number.parseInt(url.searchParams.get('days') || '2', 10)
  const days = Math.min(3650, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 2))
  const ticketParam = Number.parseInt(url.searchParams.get('ticket') || '', 10)
  const ticketNumber = Number.isFinite(ticketParam) ? ticketParam : undefined
  const report = await repairEmailTickets({ days, dry, ticketNumber })
  return NextResponse.json(report)
}
