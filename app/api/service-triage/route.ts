export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { triage, hoursThisMonth, type TriageInput } from '@/lib/service-triage'

// POST /api/service-triage
// Body: { raw_text, source?, source_url?, requester? }
// Triages a request, persists it to service_requests, returns the triage card.
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const raw_text = typeof body.raw_text === 'string' ? body.raw_text : ''
  if (!raw_text.trim()) {
    return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
  }

  const input: TriageInput = {
    raw_text,
    source: typeof body.source === 'string' ? body.source : 'manual',
    source_url: typeof body.source_url === 'string' ? body.source_url : undefined,
    requester: typeof body.requester === 'string' ? body.requester : undefined,
    created_by: auth.userId,
  }

  try {
    const result = await triage(input)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[service-triage POST] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'triage failed' }, { status: 500 })
  }
}

// GET /api/service-triage?status=open|in_progress|shipped|quoted&month=YYYY-MM&limit=50
// Returns the request log + hours-this-month meter.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const month = url.searchParams.get('month') // YYYY-MM
  const classification = url.searchParams.get('classification')
  const retainer = url.searchParams.get('retainer') // 'true' | 'false'
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))

  const where: string[] = []
  const params: any[] = []
  if (status) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  if (classification) {
    params.push(classification)
    where.push(`classification = $${params.length}`)
  }
  if (retainer === 'true' || retainer === 'false') {
    where.push(`retainer_covered = ${retainer === 'true' ? 'true' : 'false'}`)
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    params.push(month + '-01')
    where.push(`received_at >= $${params.length}::date AND received_at < ($${params.length}::date + INTERVAL '1 month')`)
  }
  const sql = `SELECT id, received_at, source, source_url, requester, summary,
                      classification, classification_confidence, classification_basis,
                      repo, area, keywords,
                      estimated_hours, estimate_basis, estimated_usd, retainer_covered,
                      status, started_at, approved_at, shipped_at, paid_at,
                      actual_hours, quote_amount, paid_amount, shipped_commit_sha, notes
               FROM service_requests
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY received_at DESC
               LIMIT ${limit}`
  const r = await query(sql, params)
  const meter = await hoursThisMonth()
  return NextResponse.json({ requests: r.rows, meter })
}
