export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  fetchTwentyRecord,
  fetchAttachmentsForRecord,
  classifyFile,
} from '@/lib/proof-share'
import { selectLegacyProofUrl } from '@/lib/proof-url'
import { buildFtpAttachmentId, listProofFiles, isConfigured as ftpConfigured } from '@/lib/proof-ftp'
import {
  isManifestStale,
  parseManifest,
  syncFtpShareManifest,
  type FileResponseDecision,
} from '@/lib/proof-share-sync'

/**
 * GET /api/proof-share/[token]
 *
 * Public endpoint — no auth required.
 *
 * Returns all the metadata the client-facing page needs to render:
 *   record info, attachments, designer info, and response state.
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
              client_response_note, message, created_by_name, created_by_email,
              ftp_folder_path, ftp_manifest, ftp_last_synced_at, client_name, file_responses
       FROM proof_shares WHERE token = $1`,
      [token]
    )

    if (shareResult.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const share = shareResult.rows[0]

    // FTP-sourced shares: the proofs are files in a folder on ANC's own FTP.
    // Keyed on ftp_folder_path (not the object type) so this covers BOTH
    // standalone folder shares (twenty_object_type='ftpFolder') AND ticket-tied
    // ones (a real designRequest/contentSchedule id whose proofs live on the
    // FTP) — the ticket linkage drives status write-back in respond/view, while
    // the file source is the FTP either way. Nothing is stored locally.
    if (share.ftp_folder_path) {
      const folder: string = share.ftp_folder_path || '/'
      type FtpProofFile = {
        name: string
        size: number
        modifiedAt: string
        kind: 'image' | 'video' | 'pdf' | 'other'
      }

      // Freshness pass: designers revise proofs by replacing files INSIDE the
      // folder, so the stored manifest follows the folder (TTL-gated so bursts
      // of views don't hammer the legacy box). The link itself never changes.
      // On any sync failure we fall back to the stored snapshot silently.
      let manifestRaw: unknown = share.ftp_manifest
      let manifestSource = 'stored'
      let liveFileResponses: Record<string, FileResponseDecision> =
        share.file_responses && typeof share.file_responses === 'object' ? share.file_responses : {}
      let liveClientResponse: 'approved' | 'changes_requested' | null = share.client_response || null
      if (ftpConfigured() && isManifestStale(share.ftp_last_synced_at)) {
        try {
          const synced = await syncFtpShareManifest(token, folder, share.ftp_manifest)
          manifestRaw = synced.manifest
          manifestSource = 'live-sync'
          liveFileResponses = synced.fileResponses
          liveClientResponse = synced.clientResponse
        } catch (err) {
          console.error('[proof-share/get] freshness sync failed, serving stored manifest:', err)
        }
      }

      const fullManifest = parseManifest(manifestRaw)
      const storedManifest = fullManifest.filter(
        (file) => file.active !== false
      ) as FtpProofFile[]
      let files: FtpProofFile[] = storedManifest
      if (files.length === 0) {
        manifestSource = 'legacy-ftp-fallback'
        try {
          files = (await listProofFiles(folder)).map((file) => ({
            name: file.name,
            size: file.size,
            modifiedAt: file.modifiedAt,
            kind: file.kind || 'other',
          }))
        } catch (err) {
          console.error('[proof-share/get] ftp list failed:', err)
          return NextResponse.json(
            { error: 'Could not reach the proof storage for this link right now.' },
            { status: 502 }
          )
        }
      }
      console.info('[proof-share:perf]', JSON.stringify({
        event: 'load_ftp_manifest',
        source: manifestSource,
        fileCount: files.length,
      }))
      const fileResponses = liveFileResponses
      const attachments = files.map((f, index) => {
        const id = buildFtpAttachmentId(f.name)
        return {
          id,
          name: f.name,
          extension: (f.name.split('.').pop() || '').toLowerCase(),
          category: f.kind || 'other',
          fileUrl: `/api/proof-share/${token}/file/${id}`,
          displayNumber: index + 1,
          lastViewedAt: null,
          viewCount: 0,
          uploadedAt: f.modifiedAt,
          response: fileResponses[id]?.response || null,
          responseAt: fileResponses[id]?.at || null,
        }
      })
      const previouslyApproved = fullManifest.flatMap((file) => {
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
      const folderLabel = folder.replace(/\/+$/, '').split('/').pop() || 'Proof'
      return NextResponse.json({
        token,
        state: liveClientResponse
          ? liveClientResponse === 'approved' ? 'approved' : 'changes_requested'
          : 'pending',
        recordType: 'Proof',
        recordName: folderLabel,
        clientName: share.client_name || null,
        message: share.message,
        createdByName: share.created_by_name,
        createdByEmail: share.created_by_email,
        createdAt: share.created_at,
        viewCount: share.view_count,
        lastViewedAt: share.last_viewed_at,
        clientResponse: liveClientResponse,
        clientResponseAt: share.client_response_at,
        clientResponseNote: share.client_response_note,
        previouslyApproved,
        attachments,
      })
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
                dr.ftp_proof_link, dr.legacy_ftp_proof_link, dr.ftp_final_link, dr.notes,
                v.name AS venue_name, dr.company_name
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
        legacy_ftp_proof_link: null,
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
        displayNumber: number
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
          displayNumber: attachments.length + 1,
          version: Number(f.version || 1),
          lastViewedAt: f.last_viewed_at,
          viewCount: Number(f.view_count || 0),
          uploadedAt: f.created_at,
        })
      }
      // Nothing uploaded — fall back to the pre-dashboard workspace link, if
      // this ticket still carries one.
      //
      // NEVER fall back to `ftp_proof_link` without the managed-URL guard.
      // Minting a share OVERWRITES that column with this page's own URL and
      // moves the original workspace link to `legacy_ftp_proof_link`, so the
      // unguarded read produced a card that linked to the page the client was
      // already on — which is exactly how an empty proof read as "expired".
      // Records that never got converted still hold their workspace URL in
      // `ftp_proof_link` and are served by the second candidate.
      const legacyProofUrl = selectLegacyProofUrl(
        row.legacy_ftp_proof_link,
        row.ftp_proof_link
      )
      if (attachments.length === 0 && legacyProofUrl) {
        attachments.push({
          id: 'proof-link',
          name: 'Open proof in ANC Workspace',
          extension: 'link',
          category: 'link',
          fileUrl: legacyProofUrl,
          displayNumber: 1,
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

    const attachmentsForClient = attachments.map((a, index) => {
      const extension = a.file?.[0]?.extension || ''
      return {
        id: a.id,
        name: a.name,
        extension,
        category: classifyFile(extension),
        // Clients use our proxy — never the raw Twenty URL
        fileUrl: `/api/proof-share/${token}/file/${a.id}`,
        displayNumber: index + 1,
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
