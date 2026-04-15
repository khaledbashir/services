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
      triggerWorkspaceMemberId,
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

    // Status gate — only generate share when record is in CLIENT_REVIEW.
    // Workflow filter steps in Twenty are unreliable for .updated trigger output,
    // so we re-check here against the live record. Other updates are no-ops.
    const TRIGGER_STATUS_BY_TYPE: Record<string, string> = {
      designRequest: 'STATUS_CLIENT_REVIEW',
      cgDesignRequest: 'STATUS_REVIEW',
      contentSchedule: 'STATUS_REQUEST_SUBMITTED',
      printRequest: 'STATUS_AWAITING_APPROVAL',
    }
    const requiredStatus = TRIGGER_STATUS_BY_TYPE[twentyObjectType]
    const currentStatus = (record as any).status
    if (requiredStatus && currentStatus !== requiredStatus) {
      return NextResponse.json({
        skipped: true,
        reason: `status is ${currentStatus ?? 'null'}, requires ${requiredStatus}`,
      })
    }

    // Idempotency — if a live (unanswered, unexpired) share already exists for
    // this record, return it instead of creating a duplicate. This makes the
    // workflow safe to fire multiple times for the same status change.
    const { rows: existing } = await query(
      `SELECT token FROM proof_shares
       WHERE twenty_object_type = $1
         AND twenty_record_id = $2
         AND client_response IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [twentyObjectType, twentyRecordId]
    )
    // ---- Personalization placeholders for the email body ----
    // Resolve a friendly client name (Company name → email local-part → "there")
    let resolvedClientName: string | null = null
    const designClientId = (record as any).designClientId
    if (designClientId) {
      try {
        const co = await fetchTwentyRecord('company' as any, designClientId).catch(() => null)
        if (co && (co as any).name) resolvedClientName = String((co as any).name)
      } catch {}
    }
    if (!resolvedClientName) {
      const ce = clientEmail || (record as any).proofClientEmail
      if (ce && typeof ce === 'string') {
        const local = ce.split('@')[0]
        // "john.smith" → "John", "marketing" → "Marketing"
        const first = local.split(/[._-]/)[0] || local
        if (first) resolvedClientName =
          first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
      }
    }
    if (!resolvedClientName) resolvedClientName = 'there'

    // Resolve sender name from the workspace member who triggered the change
    let resolvedSenderName: string | null = createdByName || null
    if (!resolvedSenderName && triggerWorkspaceMemberId) {
      try {
        const wm = await fetch(
          `${process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'}/rest/workspaceMembers/${triggerWorkspaceMemberId}`,
          { headers: { Authorization: `Bearer ${process.env.TWENTY_API_TOKEN || ''}` } }
        ).then((r) => r.json())
        const m = wm?.data?.workspaceMember
        if (m?.name?.firstName || m?.name?.lastName) {
          resolvedSenderName = `${m.name.firstName ?? ''} ${m.name.lastName ?? ''}`.trim()
        }
      } catch {}
    }
    if (!resolvedSenderName) resolvedSenderName = 'ANC Sports'

    // Other useful template placeholders pulled from the record
    const dueDateRaw = (record as any).dueDate
    const dueDateFormatted = dueDateRaw
      ? new Date(dueDateRaw).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })
      : ''

    if (existing.length > 0) {
      const existingToken = existing[0].token
      return NextResponse.json({
        token: existingToken,
        url: buildPublicUrl(existingToken),
        reused: true,
        clientName: resolvedClientName,
        senderName: resolvedSenderName,
        recordName: record.name,
        dueDate: dueDateFormatted,
      })
    }

    const attachments = await fetchAttachmentsForRecord(twentyObjectType, twentyRecordId)
    if (attachments.length === 0) {
      return NextResponse.json(
        { error: 'This record has no attachments. Drop the proof file into the record in Twenty first.' },
        { status: 400 }
      )
    }

    const token = generateToken()
    const days = Number(expiresInDays)
    const expiresAt =
      (days > 0 && Number.isFinite(days))
        ? new Date(Date.now() + days * 86_400_000)
        : null

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
      clientName: resolvedClientName,
      senderName: resolvedSenderName,
      dueDate: dueDateFormatted,
    })
  } catch (err) {
    console.error('[proof-share/create] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
