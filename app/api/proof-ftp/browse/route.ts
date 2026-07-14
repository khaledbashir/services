export const runtime = 'nodejs'          // ssh2 needs the Node runtime, not edge
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { listDir, resolveClientFolder, isConfigured } from '@/lib/proof-ftp'
import { requireAuth, isAuthError } from '@/lib/rbac'

const CONTENT_LIBRARY_ROLES = new Set(['admin', 'tech_support', 'manager', 'designer', 'design_contractor'])

async function authorize(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  if (!CONTENT_LIBRARY_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return auth
}

/**
 * GET /api/proof-ftp/browse?path=/T/TIN&page=1&pageSize=100
 *
 * Internal, auth-gated. Lists ONE directory level on ANC's FTP so a designer
 * can navigate to the folder that holds a client's proofs and pick it. Never
 * lists the whole tree — the root alone is ~20,000 folders.
 */
export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if (isAuthError(auth)) return auth
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'The content library is not fully configured.' },
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
    const isBoundaryError = /escapes root|outside the approved|select an approved/i.test(msg)
    return NextResponse.json(
      { error: isBoundaryError ? 'That folder is outside the approved content library.' : 'Could not read the content library.' },
      { status: isBoundaryError ? 400 : 502 }
    )
  }
}
