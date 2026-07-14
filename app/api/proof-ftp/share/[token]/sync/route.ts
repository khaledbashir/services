export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { isConfigured } from '@/lib/proof-ftp'
import { syncFtpShareManifest } from '@/lib/proof-share-sync'
import { requireAuth, isAuthError } from '@/lib/rbac'

const CONTENT_LIBRARY_ROLES = new Set(['admin', 'tech_support', 'manager', 'designer', 'design_contractor'])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  if (!CONTENT_LIBRARY_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: 'The content library is not fully configured.' }, { status: 503 })
  }

  const { token } = await params
  const shareResult = await query(
    `SELECT ftp_folder_path, ftp_manifest, ftp_last_synced_at
     FROM proof_shares
     WHERE token = $1 AND ftp_folder_path IS NOT NULL`,
    [token]
  )
  if (shareResult.rows.length === 0) {
    return NextResponse.json({ error: 'Proof link not found' }, { status: 404 })
  }

  const share = shareResult.rows[0]
  let result
  try {
    result = await syncFtpShareManifest(token, share.ftp_folder_path, share.ftp_manifest)
  } catch {
    return NextResponse.json({ error: 'Could not refresh the content library folder.' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    syncedAt: result.syncedAt,
    activeFileCount: result.manifest.filter((entry) => entry.active !== false).length,
    added: result.added,
    updated: result.updated,
    unpublished: result.removed,
    unchanged: result.unchanged,
  })
}
