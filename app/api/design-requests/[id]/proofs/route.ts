import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, listProofsForRequest, isConfigured, getSignedDownloadUrl } from '@/lib/proof-storage'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { createDesignProofShare } from '@/lib/design-proof'

// Dashboard status values considered "pre-review" — uploading a proof from any
// of these auto-advances the request to client_review, which in turn fires
// the proof-share email to the client. Tracked as a const so the stages UI
// can reuse it for labelling the "active" stage.
const PRE_REVIEW_STATUSES = new Set([
  'request_submitted',
  'in_queue',
  'in_progress',
  'in_qc',
])

// List every proof file (latest first) attached to this design request.
// Combines the legacy bytea-backed rows and the new MinIO-backed rows into
// a single response so the UI doesn't care about the migration.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_key, storage_backend, storage_etag,
            created_at, version, last_viewed_at, view_count
     FROM design_request_files
     WHERE design_request_id = $1
     ORDER BY version DESC, created_at DESC`,
    [params.id]
  )

  return NextResponse.json({
    proofs: res.rows.map((r: any) => ({
      id: r.id,
      filename: r.filename,
      mime_type: r.mime_type,
      size_bytes: Number(r.size_bytes || 0),
      backend: r.storage_backend,
      has_storage_key: Boolean(r.storage_key),
      uploaded_at: r.created_at,
      version: Number(r.version || 1),
      last_viewed_at: r.last_viewed_at,
      view_count: Number(r.view_count || 0),
    })),
  })
}

// Upload a new proof file. Designer calls this from the design-request
// detail page. Body is multipart/form-data with a single `file` field.
//
// Stores to MinIO via `lib/proof-storage.ts` when configured. Falls back to
// bytea storage if MinIO isn't reachable — means the upload never fails on
// the designer's side just because the infra container flaked.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  // Confirm the design request exists before accepting the upload. Cheap
  // guard — prevents orphaned objects in MinIO if someone POSTs a bad id.
  const drRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (drRes.rows.length === 0) {
    return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "file" part' }, { status: 400 })
  }
  const filename = (file as any).name || 'upload'
  const contentType = file.type || 'application/octet-stream'

  // 500MB hard cap — anything bigger and the designer should use chunked
  // upload. Not worth building for today; revisit if a real 1GB PSD shows up.
  const MAX_SIZE = 500 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File exceeds 500MB limit (${(file.size / 1024 / 1024).toFixed(0)}MB)` }, { status: 413 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // Prefer MinIO. Fall back to bytea only if the storage layer isn't wired.
  let storageBackend: 's3' | 'postgres_bytea' = 'postgres_bytea'
  let storageKey: string | null = null
  let storageEtag: string | null = null
  let byteaData: Buffer | null = bytes

  if (isConfigured()) {
    try {
      const uploaded = await uploadProof({
        designRequestId: params.id,
        filename,
        contentType,
        body: bytes,
      })
      storageBackend = 's3'
      storageKey = uploaded.key
      storageEtag = uploaded.etag
      byteaData = null  // don't double-store
    } catch (err) {
      console.error('[proofs POST] MinIO upload failed, falling back to bytea:', err)
    }
  }

  const inserted = await query(
    `INSERT INTO design_request_files
       (design_request_id, filename, mime_type, size_bytes, data, uploaded_by,
        storage_key, storage_backend, storage_etag, version)
     SELECT
       $1,$2,$3,$4,$5,$6,$7,$8,$9,
       COALESCE(MAX(version), 0) + 1
     FROM design_request_files
     WHERE design_request_id = $1
     RETURNING id, filename, mime_type, size_bytes, storage_backend, created_at, version`,
    [params.id, filename, contentType, bytes.byteLength, byteaData, auth.userId,
     storageKey, storageBackend, storageEtag]
  )

  // The download URL is the authoritative file pointer (legacy consumers + the
  // Twenty record both want this). The client-facing share URL ("nice link")
  // gets filled in below once the proof-share record is created.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
  const downloadUrl = `${baseUrl}/api/design-requests/${params.id}/proofs/${inserted.rows[0].id}/download`
  await query(
    `UPDATE design_requests SET ftp_proof_link = $1, updated_at = NOW() WHERE id = $2`,
    [downloadUrl, params.id]
  )

  // Reactive cascade: if this is the designer's first proof upload on a request
  // that hasn't been sent to the client yet, auto-advance to client_review. That
  // transition fires createDesignProofShare (public token + client email) and
  // mirrors the share URL back onto the Twenty record.
  let proofShareUrl: string | null = null
  let statusAdvanced = false
  try {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const current = await Designs.get(params.id)
      const currentStatus = ((current as any)?.status || '').toString().replace(/^STATUS_/i, '').toLowerCase()
      if (!current || PRE_REVIEW_STATUSES.has(currentStatus) || currentStatus === 'submitted' || currentStatus === '') {
        await Designs.update(params.id, { status: 'STATUS_CLIENT_REVIEW' as any })
        const share = await createDesignProofShare({
          designRequestId: params.id,
          createdByName: auth.fullName || null,
          createdByEmail: auth.email || null,
        })
        proofShareUrl = share.url
        statusAdvanced = true
        // Denormalize the share URL onto Twenty so anyone reading the record
        // directly (Jireh in Twenty) sees what we sent the client.
        try {
          await Designs.update(params.id, { proofLink: share.url, proofSentAt: new Date().toISOString() } as any)
        } catch (err) {
          console.error('[proofs POST] proofLink mirror failed:', err)
        }
      }
    } else {
      // Legacy local path: same cascade, but against design_requests table.
      const r = await query(`SELECT status FROM design_requests WHERE id = $1`, [params.id])
      const currentStatus = r.rows[0]?.status
      if (!currentStatus || PRE_REVIEW_STATUSES.has(currentStatus)) {
        await query(`UPDATE design_requests SET status = 'client_review', updated_at = NOW() WHERE id = $1`, [params.id])
        const share = await createDesignProofShare({
          designRequestId: params.id,
          createdByName: auth.fullName || null,
          createdByEmail: auth.email || null,
        })
        proofShareUrl = share.url
        statusAdvanced = true
        await query(
          `UPDATE design_requests SET ftp_proof_link = $1 WHERE id = $2 AND (ftp_proof_link IS NULL OR ftp_proof_link = '' OR ftp_proof_link = $3)`,
          [share.url, params.id, downloadUrl]
        )
      }
    }
  } catch (err) {
    // Don't fail the upload just because the status cascade hit a snag —
    // designer still sees the file landed, can advance status manually.
    console.error('[proofs POST] status-advance cascade failed:', err)
  }

  return NextResponse.json({
    proof: {
      id: inserted.rows[0].id,
      filename: inserted.rows[0].filename,
      mime_type: inserted.rows[0].mime_type,
      size_bytes: Number(inserted.rows[0].size_bytes || 0),
      backend: inserted.rows[0].storage_backend,
      uploaded_at: inserted.rows[0].created_at,
      version: Number(inserted.rows[0].version || 1),
      download_url: downloadUrl,
    },
    status_advanced: statusAdvanced,
    proof_share_url: proofShareUrl,
  })
}
