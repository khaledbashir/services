import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  fetchTwentyRecord,
  fetchAttachmentsForRecord,
  generateToken,
  buildPublicUrl,
  patchTwentyRecord,
  sendProofEmailToClient,
} from '@/lib/proof-share'

/**
 * POST /api/proof-share/create
 *
 * Body:
 *   twentyObjectType: 'printRequest' | 'designRequest' | 'cgDesignRequest' | 'contentSchedule'
 *   twentyRecordId:   UUID of the record
 *   expiresInDays?:   number — optional expiration (default: no expiration)
 *   message?:         string — optional message from the designer to the client
 *   createdByName?:   string — designer's name (for the UI)
 *   createdByEmail?:  string — designer's email (for the UI)
 *
 * Returns:
 *   { token, url, expiresAt, attachmentCount }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      twentyObjectType,
      twentyRecordId,
      expiresInDays,
      message,
      createdByName,
      createdByEmail,
      clientEmail,
    } = body

    if (!twentyObjectType || !twentyRecordId) {
      return NextResponse.json(
        { error: 'twentyObjectType and twentyRecordId are required' },
        { status: 400 }
      )
    }

    if (!OBJECT_CONFIGS[twentyObjectType]) {
      return NextResponse.json(
        {
          error: `Unknown object type "${twentyObjectType}"`,
          validTypes: Object.keys(OBJECT_CONFIGS),
        },
        { status: 400 }
      )
    }

    // Verify the record exists in Twenty
    const record = await fetchTwentyRecord(twentyObjectType, twentyRecordId)
    if (!record) {
      return NextResponse.json(
        { error: 'Record not found in Twenty CRM' },
        { status: 404 }
      )
    }

    // Verify at least one attachment exists
    const attachments = await fetchAttachmentsForRecord(twentyObjectType, twentyRecordId)
    if (attachments.length === 0) {
      return NextResponse.json(
        { error: 'This record has no attachments. Upload a proof file to Twenty first.' },
        { status: 400 }
      )
    }

    // Generate a unique token + optional expiration
    const token = generateToken()
    const expiresAt =
      expiresInDays && Number.isFinite(Number(expiresInDays))
        ? new Date(Date.now() + Number(expiresInDays) * 86_400_000)
        : null

    // Auto-expire any prior shares on this record — a new version obsoletes old links
    await query(
      `UPDATE proof_shares
       SET expires_at = NOW()
       WHERE twenty_object_type = $1
         AND twenty_record_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [twentyObjectType, twentyRecordId]
    )

    await query(
      `INSERT INTO proof_shares (
        token, twenty_object_type, twenty_record_id, expires_at,
        message, created_by_name, created_by_email, client_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        token,
        twentyObjectType,
        twentyRecordId,
        expiresAt,
        message || null,
        createdByName || null,
        createdByEmail || null,
        clientEmail || null,
      ]
    )

    const publicUrl = buildPublicUrl(token)

    // Sync state back to Twenty so designers see it on the record
    void patchTwentyRecord(twentyObjectType, twentyRecordId, {
      proofShareUrl: publicUrl,
      proofSentAt: new Date().toISOString(),
      proofViewCount: 0,
      proofLastViewedAt: null,
      proofRespondedAt: null,
      proofClientEmail: clientEmail || null,
    })

    // Auto-email the client with a thumbnail + Approve/Request Changes buttons
    let emailed = false
    if (clientEmail) {
      emailed = await sendProofEmailToClient({
        token,
        clientEmail,
        recordName: record.name || 'Your proof',
        recordTypeLabel: OBJECT_CONFIGS[twentyObjectType].displayLabel,
        message: message || null,
        designerName: createdByName || null,
        designerEmail: createdByEmail || null,
        expiresAt,
        attachments,
        // If this record already had a prior share (auto-expired above), treat as a renewal
        isRenewal: false,
      })
    }

    return NextResponse.json({
      token,
      url: publicUrl,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      attachmentCount: attachments.length,
      recordName: record.name,
      emailed,
    })
  } catch (err) {
    console.error('[proof-share/create] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
