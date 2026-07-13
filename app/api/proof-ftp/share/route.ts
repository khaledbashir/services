export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { query } from '@/lib/db'
import { generateToken, buildPublicUrl, OBJECT_CONFIGS, patchTwentyRecord } from '@/lib/proof-share'
import { listProofFiles, resolveSafePath, isConfigured } from '@/lib/proof-ftp'

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

/**
 * POST /api/proof-ftp/share
 *
 * Internal, auth-gated. Mints a public proof link for a folder on ANC's FTP.
 * The client opens the returned URL and swipe-reviews whatever files are in
 * that folder — same UI as every other proof share, just a different source.
 *
 * Body: { folderPath, clientName?, clientEmail?, message?, expiresInDays?,
 *         createdByName?, createdByEmail? }
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequestAuth(request))) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'ANC FTP is not configured on this server (ANC_FTP_* env vars missing).' },
      { status: 503 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    folderPath,
    clientName,
    clientEmail,
    message,
    expiresInDays,
    createdByName,
    createdByEmail,
    // Optional ticket linkage — when Alexis creates the proof FROM a ticket, the
    // share ties to that ticket so client approval flows back to its status.
    twentyObjectType,
    twentyRecordId,
  } = body || {}

  if (!folderPath || typeof folderPath !== 'string') {
    return NextResponse.json({ error: 'folderPath is required' }, { status: 400 })
  }

  // If linking to a ticket, the object type must be a known one. When absent the
  // share is standalone (twenty_object_type='ftpFolder', no record).
  const linkedToTicket = Boolean(twentyObjectType && twentyRecordId)
  if (linkedToTicket && !OBJECT_CONFIGS[twentyObjectType]) {
    return NextResponse.json(
      { error: `Unknown ticket type "${twentyObjectType}"`, validTypes: Object.keys(OBJECT_CONFIGS) },
      { status: 400 }
    )
  }

  // Validate the path is inside the account root and actually holds files.
  let safePath: string
  try {
    safePath = resolveSafePath(folderPath)
  } catch {
    return NextResponse.json({ error: 'folderPath is outside the allowed root' }, { status: 400 })
  }

  let files
  try {
    files = await listProofFiles(safePath)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not read that folder on the FTP: ${err?.message || err}` },
      { status: 502 }
    )
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'That folder has no viewable files in it. Pick a folder that contains the proofs.' },
      { status: 400 }
    )
  }

  const token = generateToken()
  const days = Number(expiresInDays)
  const expiresAt =
    days > 0 && Number.isFinite(days) ? new Date(Date.now() + days * 86_400_000) : null

  // When tied to a ticket, keep the ticket's real object type + id so approval
  // writes back to it; otherwise it's a standalone folder share. Either way the
  // FTP folder path is what makes the files come from the FTP.
  // The native Design Ticket screen passes `designRequest`, but its record is
  // owned by anc-services rather than Twenty. Persist the local object type so
  // the public response handler advances Step 5 to Step 6 in the native ticket.
  const objectType = linkedToTicket
    ? (twentyObjectType === 'designRequest' ? 'localDesignRequest' : twentyObjectType)
    : 'ftpFolder'
  const recordId = linkedToTicket ? twentyRecordId : null
  const ftpManifest = files.map((file) => ({
    name: file.name,
    size: file.size,
    modifiedAt: file.modifiedAt,
    kind: file.kind || 'other',
  }))

  await query(
    `INSERT INTO proof_shares (
       token, twenty_object_type, twenty_record_id, ftp_folder_path, ftp_manifest,
       client_name, client_email, message, created_by_name, created_by_email, expires_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
    [
      token,
      objectType,
      recordId,
      safePath,
      JSON.stringify(ftpManifest),
      clientName || null,
      clientEmail || null,
      message || null,
      createdByName || null,
      createdByEmail || null,
      expiresAt,
    ]
  )

  const publicUrl = buildPublicUrl(token)

  // Stamp the proof link onto the ticket so it shows on the record, same as the
  // CRM-attachment proof flow does.
  if (linkedToTicket) {
    if (twentyObjectType === 'designRequest') {
      // Keep any pre-dashboard/workspace link as read-only history before the
      // new managed proof URL becomes the current client link. No bulk or
      // destructive migration: this only runs when someone explicitly creates
      // a new proof for that ticket.
      await query(
        `UPDATE design_requests
         SET legacy_ftp_proof_link = COALESCE(
               legacy_ftp_proof_link,
               CASE
                 WHEN ftp_proof_link IS NOT NULL
                  AND ftp_proof_link !~ '/proof/[A-Za-z0-9_-]+/?$'
                 THEN ftp_proof_link
                 ELSE NULL
               END
             ),
             ftp_proof_link = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [publicUrl, twentyRecordId]
      )
    }
    void patchTwentyRecord(twentyObjectType, twentyRecordId, {
      proofShareUrl: publicUrl,
      proofSentAt: new Date().toISOString(),
      proofViewCount: 0,
      proofLastViewedAt: null,
      proofRespondedAt: null,
      proofClientEmail: clientEmail || null,
    })
  }

  return NextResponse.json({
    token,
    url: publicUrl,
    folderPath: safePath,
    fileCount: files.length,
    linkedToTicket,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  })
}
