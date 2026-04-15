import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  fetchTwentyRecord,
  fetchAttachmentsForRecord,
  generateToken,
  buildPublicUrl,
  patchTwentyRecord,
} from '@/lib/proof-share'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'anc-services-webhook-2026'

async function verifyRequestAuth(request: NextRequest): Promise<boolean> {
  if (request.headers.get('x-webhook-secret') === WEBHOOK_SECRET) return true
  const token = request.cookies.get('token')?.value
  if (!token) return false
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyRequestAuth(request))) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

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

    const record = await fetchTwentyRecord(twentyObjectType, twentyRecordId)
    if (!record) {
      return NextResponse.json(
        { error: 'Record not found in Twenty CRM' },
        { status: 404 }
      )
    }

    const attachments = await fetchAttachmentsForRecord(twentyObjectType, twentyRecordId)
    const hasFtpLink = !!(record as any).ftpProofLink
    if (attachments.length === 0 && !hasFtpLink) {
      return NextResponse.json(
        { error: 'This record has no attachments or FTP link. Upload a proof file to Twenty first.' },
        { status: 400 }
      )
    }

    const token = generateToken()
    const days = Number(expiresInDays)
    const expiresAt =
      (days > 0 && Number.isFinite(days))
        ? new Date(Date.now() + days * 86_400_000)
        : null

    await query(
      `UPDATE proof_shares
       SET expires_at = NOW()
       WHERE twenty_object_type = $1
         AND twenty_record_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [twentyObjectType, twentyRecordId]
    )

    const recipientEmail = clientEmail || (record as any).proofClientEmail || null

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
        recipientEmail,
      ]
    )

    const publicUrl = buildPublicUrl(token)

    void patchTwentyRecord(twentyObjectType, twentyRecordId, {
      proofShareUrl: publicUrl,
      proofSentAt: new Date().toISOString(),
      proofViewCount: 0,
      proofLastViewedAt: null,
      proofRespondedAt: null,
      proofClientEmail: recipientEmail,
    })

    return NextResponse.json({
      token,
      url: publicUrl,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      attachmentCount: attachments.length,
      recordName: record.name,
    })
  } catch (err) {
    console.error('[proof-share/create] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
