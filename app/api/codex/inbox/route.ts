import { NextRequest, NextResponse } from 'next/server'
import { listCodexInbox } from '@/lib/codex-request-inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const expected = process.env.CODEX_INBOX_API_KEY || process.env.JWT_SECRET || ''
  if (!expected) return false
  const url = new URL(request.url)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const key = request.headers.get('x-codex-inbox-key') || url.searchParams.get('key') || bearer
  return key === expected
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'new'
  const limit = parseInt(url.searchParams.get('limit') || '25', 10)
  const rows = await listCodexInbox(status, limit)
  return NextResponse.json({ ok: true, rows })
}
