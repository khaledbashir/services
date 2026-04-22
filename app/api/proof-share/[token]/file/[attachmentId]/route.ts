import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { fetchAttachmentById, fetchAttachmentsForRecord } from '@/lib/proof-share'
import { getSignedDownloadUrl } from '@/lib/proof-storage'

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

    // Local design_request_files attachments are prefixed `file-<uuid>` and
    // stored either in Postgres bytea or MinIO. They never round-trip through
    // Twenty, so we short-circuit the Twenty flow entirely for them.
    if (attachmentId.startsWith('file-') && share.twenty_object_type === 'localDesignRequest') {
      const fileId = attachmentId.slice(5)
      const fileResult = await query(
        `SELECT id, design_request_id, filename, mime_type, size_bytes, data, storage_key, storage_backend
         FROM design_request_files
         WHERE id = $1 AND design_request_id = $2`,
        [fileId, share.twenty_record_id]
      )
      if (fileResult.rows.length === 0) {
        return new NextResponse('Attachment does not belong to this proof', { status: 403 })
      }
      const row = fileResult.rows[0]
      if (row.storage_backend === 's3' && row.storage_key) {
        const signedUrl = await getSignedDownloadUrl(row.storage_key, 3600)
        // Proxy-stream from MinIO so the browser sees our domain in Content-Security
        // headers and we can add proof-share analytics later if needed.
        const upstream = await fetch(signedUrl)
        if (!upstream.ok) return new NextResponse(`Upstream ${upstream.status}`, { status: 502 })
        const headers = new Headers({
          'Content-Type': upstream.headers.get('content-type') || row.mime_type || 'application/octet-stream',
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': `inline; filename="${(row.filename || 'proof').replace(/[\r\n"\\]/g, '')}"`,
        })
        const cl = upstream.headers.get('content-length'); if (cl) headers.set('Content-Length', cl)
        return new NextResponse(upstream.body, { status: 200, headers })
      }
      // Bytea fallback
      if (!row.data) return new NextResponse('File body missing', { status: 500 })
      return new NextResponse(row.data, {
        status: 200,
        headers: {
          'Content-Type': row.mime_type || 'application/octet-stream',
          'Content-Length': String(row.size_bytes || row.data.length),
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': `inline; filename="${(row.filename || 'proof').replace(/[\r\n"\\]/g, '')}"`,
        },
      })
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
      'Content-Disposition': `inline; filename="${(matching.name || 'proof').replace(/[\r\n"\\]/g, '')}"`,
    })
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (err) {
    console.error('[proof-share/file] error:', err)
    return new NextResponse('Error fetching file', { status: 500 })
  }
}
