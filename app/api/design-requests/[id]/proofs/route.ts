export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, listProofsForRequest, isConfigured, getSignedDownloadUrl } from '@/lib/proof-storage'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// List every proof file (latest first) attached to this design request.
// Combines the legacy bytea-backed rows and the new MinIO-backed rows into
// a single response so the UI doesn't care about the migration.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_key, storage_backend, storage_etag,
            created_at, version, last_viewed_at, view_count,
            is_ai_generated, ai_model
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
      is_ai_generated: Boolean(r.is_ai_generated),
      ai_model: r.ai_model || null,
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

  // Confirm the design request exists. When TWENTY_BACKED_DESIGNS is on and
  // the local design_requests table doesn't have a mirror row (e.g. the record
  // was created after the flag flipped, or never migrated from Wrike), look it
  // up in Twenty and auto-create a minimal stub row so the design_request_files
  // FK insert doesn't blow up with "Design request not found".
  const drRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (drRes.rows.length === 0) {
    if (isTwentyBackedEnabled('DESIGNS')) {
      try {
        const d = await Designs.get(params.id) as any
        if (!d) {
          return NextResponse.json({ error: 'Design request not found (missing from Twenty too)' }, { status: 404 })
        }
        await query(
          `INSERT INTO design_requests (id, job_title, company_name, status, notes, boards_requested, due_date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            d.id,
            d.name || '(untitled)',
            d.designClient?.name || null,
            ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
            typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || ''),
            d.boardSection || null,
            d.dueDate || null,
          ]
        )
      } catch (err) {
        console.error('[proofs POST] stub create failed:', err)
        return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
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

  // Per Alexis (2026-04-23 meeting): uploading a proof does NOT auto-send it
  // to the client. The designer uploads, Alexis (Enterprise Solutions) runs
  // QC first, then explicitly moves status to "Client Review" — that
  // transition is what fires createDesignProofShare (public token + client
  // email) via the PATCH handler in app/api/design-requests/[id]/route.ts.
  //
  // Optional soft-advance: if the request is still at `request_submitted`
  // when the designer uploads, nudge it to `in_progress` so the pipeline
  // reflects real work. Anything past that stays where the designer put it.
  let statusAdvanced = false
  try {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const current = await Designs.get(params.id)
      const currentStatus = ((current as any)?.status || '').toString().replace(/^STATUS_/i, '').toLowerCase()
      if (!currentStatus || currentStatus === 'request_submitted') {
        await Designs.update(params.id, { status: 'STATUS_IN_PROGRESS' as any })
        statusAdvanced = true
      }
    } else {
      const r = await query(`SELECT status FROM design_requests WHERE id = $1`, [params.id])
      const currentStatus = r.rows[0]?.status
      if (!currentStatus || currentStatus === 'request_submitted') {
        await query(`UPDATE design_requests SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [params.id])
        statusAdvanced = true
      }
    }
  } catch (err) {
    // Don't fail the upload just because the status nudge hit a snag.
    console.error('[proofs POST] status-nudge failed:', err)
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
  })
}
