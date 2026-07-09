export const runtime = 'nodejs'          // ssh2 needs the Node runtime, not edge
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { listDir, resolveClientFolder, isConfigured } from '@/lib/proof-ftp'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'

async function verifyRequestAuth(request: NextRequest): Promise<boolean> {
  if (request.headers.get('x-webhook-secret') === WEBHOOK_SECRET) return true
  const token = request.cookies.get('token')?.value
  if (!token) return false
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

/**
 * GET /api/proof-ftp/browse?path=/T/TIN&page=1&pageSize=100
 *
 * Internal, auth-gated. Lists ONE directory level on ANC's FTP so a designer
 * can navigate to the folder that holds a client's proofs and pick it. Never
 * lists the whole tree — the root alone is ~20,000 folders.
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequestAuth(request))) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'ANC FTP is not configured on this server (ANC_FTP_* env vars missing).' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('pageSize') || 100)
  const triCode = searchParams.get('triCode')
  let p = searchParams.get('path') || ''

  try {
    // No explicit path but a tri-code given (opened from a ticket): try to land
    // on the client's folder; fall back to root if it isn't filed by tri-code.
    let resolvedFrom: string | null = null
    if (!p && triCode) {
      const folder = await resolveClientFolder(triCode)
      if (folder) { p = folder; resolvedFrom = triCode }
    }
    if (!p) p = '/'
    const listing = await listDir(p, { page, pageSize })
    return NextResponse.json({ ...listing, resolvedFrom })
  } catch (err: any) {
    const msg = err?.message || String(err)
    // Path-jail rejections are a client error, everything else is upstream.
    const status = /escapes root/i.test(msg) ? 400 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}
