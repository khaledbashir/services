import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  fetchTwentyRecord,
  fetchAttachmentsForRecord,
  classifyFile,
} from '@/lib/proof-share'

/**
 * GET /api/proof-share/[token]
 *
 * Public endpoint — no auth required.
 *
 * Returns all the metadata the client-facing page needs to render:
 *   record info, attachments, designer info, expiration, response state.
 *
 * Does NOT return the raw Twenty file URLs (those have JWTs and expire).
 * Instead, each attachment has an `fileUrl` pointing at our own proxy
 * endpoint which streams the bytes on demand with a fresh JWT.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const shareResult = await query(
      `SELECT token, twenty_object_type, twenty_record_id, created_at, expires_at,
              view_count, last_viewed_at, client_response, client_response_at,
              client_response_note, message, created_by_name, created_by_email
       FROM proof_shares WHERE token = $1`,
      [token]
    )

    if (shareResult.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const share = shareResult.rows[0]

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json(
        {
          error: 'This proof link has expired.',
          expiredAt: share.expires_at,
          state: 'expired',
        },
        { status: 410 }
      )
    }

    // Uploaded proof files (MinIO-backed since 2026-04-22) live in the local
    // design_request_files table regardless of whether TWENTY_BACKED_DESIGNS
    // is on — they're served through the token-gated proxy either way. So
    // treat `localDesignRequest` AND `designRequest` identically here: both
    // reference design_request_files by the same UUID. Only `printRequest` /
    // `cgDesignRequest` etc. fall through to the Twenty-attachments branch.
    if (share.twenty_object_type === 'localDesignRequest' || share.twenty_object_type === 'designRequest') {
      const dr = await query(
        `SELECT dr.id, dr.job_title, dr.status, dr.client_name, dr.client_email,
                dr.ftp_proof_link, dr.ftp_final_link, dr.notes, v.name AS venue_name,
                dr.company_name
         FROM design_requests dr LEFT JOIN venues v ON v.id = dr.venue_id
         WHERE dr.id = $1`,
        [share.twenty_record_id]
      )
      // Local stub may be missing for Twenty-backed records — fall back to
      // the proof-share metadata (createdByName/email) so the page still renders.
      const row = dr.rows[0] || {
        id: share.twenty_record_id,
        job_title: 'Design Request',
        status: null,
        client_name: null,
        client_email: null,
        ftp_proof_link: null,
        ftp_final_link: null,
        notes: null,
        venue_name: null,
        company_name: null,
      }

      // Pull uploaded proof files (both bytea and S3 backends), newest first
      const files = await query(
        `SELECT id, filename, mime_type, size_bytes, storage_backend,
                version, last_viewed_at, view_count, created_at
         FROM design_request_files
         WHERE design_request_id = $1
         ORDER BY version DESC, created_at DESC`,
        [share.twenty_record_id]
      )

      const attachments: Array<{
        id: string
        name: string
        extension: string
        category: string
        fileUrl: string
        version: number
        lastViewedAt: string | null
        viewCount: number
        uploadedAt: string
      }> = []
      for (const f of files.rows) {
        const ext = (f.filename.split('.').pop() || '').toLowerCase()
        attachments.push({
          id: `file-${f.id}`,
          name: f.filename,
          extension: ext,
          category: classifyFile(ext),
          // Route through the token-gated proxy so the download stays scoped to the share token
          fileUrl: `/api/proof-share/${token}/file/file-${f.id}`,
          version: Number(f.version || 1),
          lastViewedAt: f.last_viewed_at,
          viewCount: Number(f.view_count || 0),
          uploadedAt: f.created_at,
        })
      }
      // Append legacy FTP link if no uploaded files (legacy records only)
      if (attachments.length === 0 && row.ftp_proof_link) {
        attachments.push({
          id: 'proof-link',
          name: 'Proof (legacy FTP)',
          extension: 'link',
          category: 'link',
          fileUrl: row.ftp_proof_link,
          version: 1,
          lastViewedAt: null,
          viewCount: 0,
          uploadedAt: share.created_at,
        })
      }
      return NextResponse.json({
        token,
        state: share.client_response
          ? share.client_response === 'approved' ? 'approved' : 'changes_requested'
          : 'pending',
        recordType: 'Design Request',
        recordName: row.job_title || 'Design Request',
        clientName: row.client_name || row.company_name || row.venue_name || null,
        message: share.message,
        createdByName: share.created_by_name,
        createdByEmail: share.created_by_email,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        viewCount: share.view_count,
        lastViewedAt: share.last_viewed_at,
        clientResponse: share.client_response,
        clientResponseAt: share.client_response_at,
        clientResponseNote: share.client_response_note,
        attachments,
      })
    }

    const cfg = OBJECT_CONFIGS[share.twenty_object_type]
    if (!cfg) {
      return NextResponse.json({ error: 'Invalid record type' }, { status: 500 })
    }

    // Fetch the Twenty record (for record name, status, client info)
    const record = await fetchTwentyRecord(share.twenty_object_type, share.twenty_record_id)
    if (!record) {
      return NextResponse.json(
        { error: 'The record this proof references no longer exists.' },
        { status: 404 }
      )
    }

    // Fetch current attachments
    const attachments = await fetchAttachmentsForRecord(
      share.twenty_object_type,
      share.twenty_record_id
    )

    const attachmentsForClient = attachments.map((a) => {
      const extension = a.file?.[0]?.extension || ''
      return {
        id: a.id,
        name: a.name,
        extension,
        category: classifyFile(extension),
        // Clients use our proxy — never the raw Twenty URL
        fileUrl: `/api/proof-share/${token}/file/${a.id}`,
      }
    })

    // FTP proof links are intentionally not surfaced — proofs live in
    // Twenty attachments now. Legacy ftpProofLink values stay on the
    // record for reference but we never render them to clients.

    return NextResponse.json({
      token,
      state: share.client_response
        ? share.client_response === 'approved'
          ? 'approved'
          : 'changes_requested'
        : 'pending',
      recordType: cfg.displayLabel,
      recordName: record.name || 'Proof',
      clientName:
        (cfg.clientFieldName && (record as Record<string, unknown>)[cfg.clientFieldName]) || null,
      message: share.message,
      createdByName: share.created_by_name,
      createdByEmail: share.created_by_email,
      createdAt: share.created_at,
      expiresAt: share.expires_at,
      viewCount: share.view_count,
      lastViewedAt: share.last_viewed_at,
      clientResponse: share.client_response,
      clientResponseAt: share.client_response_at,
      clientResponseNote: share.client_response_note,
      attachments: attachmentsForClient,
    })
  } catch (err) {
    console.error('[proof-share/get] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
