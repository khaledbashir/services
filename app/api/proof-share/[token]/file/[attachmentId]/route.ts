import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { fetchAttachmentById, fetchAttachmentsForRecord } from '@/lib/proof-share'

/**
 * GET /api/proof-share/[token]/file/[attachmentId]
 *
 * Public file proxy. Streams attachment bytes from Twenty to the client.
 *
 * Security:
 *   1. Validates the proof share token exists and has not expired
 *   2. Validates the attachmentId actually belongs to the record this
 *      share references (prevents token-holders from reading other files)
 *   3. Re-fetches the attachment metadata on every request so the JWT URL
 *      is always fresh (Twenty's signed URLs expire after ~24 hours)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; attachmentId: string }> }
) {
  try {
    const { token, attachmentId } = await params

    // 1. Validate share
    const shareResult = await query(
      `SELECT twenty_object_type, twenty_record_id, expires_at
       FROM proof_shares WHERE token = $1`,
      [token]
    )
    if (shareResult.rows.length === 0) {
      return new NextResponse('Not found', { status: 404 })
    }
    const share = shareResult.rows[0]
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new NextResponse('Link expired', { status: 410 })
    }

    // 2. Validate that attachmentId belongs to this share's record
    const recordAttachments = await fetchAttachmentsForRecord(
      share.twenty_object_type,
      share.twenty_record_id
    )
    const matching = recordAttachments.find((a) => a.id === attachmentId)
    if (!matching) {
      return new NextResponse('Attachment does not belong to this proof', { status: 403 })
    }

    // 3. Refetch the attachment for a fresh JWT URL
    const attachment = await fetchAttachmentById(attachmentId)
    const fileUrl = attachment?.file?.[0]?.url
    if (!fileUrl) {
      return new NextResponse('File URL unavailable', { status: 500 })
    }

    // 4. Proxy the bytes
    const upstream = await fetch(fileUrl)
    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, { status: 502 })
    }

    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream'

    // Stream the body back
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300', // 5 minutes
      'Content-Disposition': `inline; filename="${(matching.name || 'proof').replace(/"/g, '')}"`,
    })
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (err) {
    console.error('[proof-share/file] error:', err)
    return new NextResponse('Error fetching file', { status: 500 })
  }
}
