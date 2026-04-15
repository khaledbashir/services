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
