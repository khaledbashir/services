import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, listProofsForRequest, isConfigured, getSignedDownloadUrl } from '@/lib/proof-storage'

// List every proof file (latest first) attached to this design request.
// Combines the legacy bytea-backed rows and the new MinIO-backed rows into
// a single response so the UI doesn't care about the migration.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_key, storage_backend, storage_etag, created_at
     FROM design_request_files
     WHERE design_request_id = $1
     ORDER BY created_at DESC`,
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
        storage_key, storage_backend, storage_etag)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, filename, mime_type, size_bytes, storage_backend, created_at`,
    [params.id, filename, contentType, bytes.byteLength, byteaData, auth.userId,
     storageKey, storageBackend, storageEtag]
  )

  // Keep the denormalized `ftp_proof_link` field pointing at the latest
  // uploaded file's dashboard URL so legacy readers + the Twenty record
  // both surface the newest proof without a refetch.
  const publicDashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/api/design-requests/${params.id}/proofs/${inserted.rows[0].id}/download`
  await query(
    `UPDATE design_requests SET ftp_proof_link = $1, updated_at = NOW() WHERE id = $2`,
    [publicDashboardUrl, params.id]
  )

  return NextResponse.json({
    proof: {
      id: inserted.rows[0].id,
      filename: inserted.rows[0].filename,
      mime_type: inserted.rows[0].mime_type,
      size_bytes: Number(inserted.rows[0].size_bytes || 0),
      backend: inserted.rows[0].storage_backend,
      uploaded_at: inserted.rows[0].created_at,
      download_url: publicDashboardUrl,
    },
  })
}
