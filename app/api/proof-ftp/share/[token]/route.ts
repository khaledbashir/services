export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { parseManifest } from '@/lib/proof-share-sync'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getSignedDownloadUrl } from '@/lib/proof-storage'
import { buildFtpAttachmentId } from '@/lib/proof-ftp'

const CONTENT_LIBRARY_ROLES = new Set(['admin', 'tech_support', 'manager', 'designer', 'design_contractor'])

/**
 * GET /api/proof-ftp/share/[token]
 *
 * Staff-facing summary of an FTP-backed proof share: the file roster with
 * each file's client decision. Powers the ticket's Approved step so the team
 * can see exactly which files were approved and which were sent back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  if (!CONTENT_LIBRARY_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { token } = await params
  const result = await query(
    `SELECT ftp_folder_path, ftp_manifest, ftp_last_synced_at, file_responses, client_uploads,
            client_response, client_response_at, client_response_note,
            view_count, last_viewed_at, client_name, client_email
     FROM proof_shares
     WHERE token = $1 AND ftp_folder_path IS NOT NULL`,
    [token]
  )
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Proof link not found' }, { status: 404 })
  }
  const share = result.rows[0]
  const fileResponses: Record<string, { response?: string; note?: string; name?: string; at?: string }> =
    share.file_responses && typeof share.file_responses === 'object' ? share.file_responses : {}

  const manifest = parseManifest(share.ftp_manifest)
  const files = manifest
    .filter((file) => file.active !== false)
    .map((file, index) => {
      const id = buildFtpAttachmentId(file.name)
      const decision = fileResponses[id]
      return {
        id,
        displayNumber: index + 1,
        name: file.name,
        kind: file.kind,
        size: file.size,
        response: decision?.response || null,
        responseNote: decision?.note || null,
        responseAt: decision?.at || null,
      }
    })

  const previouslyApproved = manifest.flatMap((file) => {
    const history = Array.isArray(file.approvalHistory)
      ? file.approvalHistory.filter((item) => item.response === 'approved')
      : []
    const legacyDecision = file.active === false ? fileResponses[buildFtpAttachmentId(file.name)] : null
    const legacy = legacyDecision?.response === 'approved'
      ? [{
          name: file.name,
          sourceVersion: file.sourceVersion,
          response: 'approved' as const,
          note: legacyDecision.note || null,
          at: legacyDecision.at || null,
          archivedAt: file.removedAt || file.modifiedAt,
        }]
      : []
    return [...history, ...legacy]
  })

  const clientUploads = await Promise.all(
    (Array.isArray(share.client_uploads) ? share.client_uploads : []).map(async (upload: {
      key?: string
      filename?: string
      contentType?: string
      size?: number
      uploadedAt?: string
      proofFolderPath?: string | null
      ftpPath?: string | null
    }) => ({
      filename: upload.filename || 'Client replacement file',
      contentType: upload.contentType || 'application/octet-stream',
      size: Number(upload.size || 0),
      uploadedAt: upload.uploadedAt || null,
      downloadUrl: upload.key ? await getSignedDownloadUrl(upload.key, 3600) : null,
      proofFolderPath: upload.proofFolderPath || null,
      ftpPath: upload.ftpPath || null,
    }))
  )

  return NextResponse.json({
    token,
    folderPath: share.ftp_folder_path,
    lastSyncedAt: share.ftp_last_synced_at,
    clientResponse: share.client_response,
    clientResponseAt: share.client_response_at,
    clientResponseNote: share.client_response_note,
    viewCount: share.view_count,
    lastViewedAt: share.last_viewed_at,
    clientName: share.client_name,
    clientEmail: share.client_email,
    approved: files.filter((f) => f.response === 'approved').length,
    changesRequested: files.filter((f) => f.response === 'changes_requested').length,
    awaiting: files.filter((f) => !f.response).length,
    files,
    previouslyApproved,
    clientUploads,
  })
}
