export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { fetchAttachmentById, fetchAttachmentsForRecord } from '@/lib/proof-share'
import { getSignedDownloadUrl } from '@/lib/proof-storage'
import { openFileStream } from '@/lib/proof-ftp'
import path from 'node:path'

export const runtime = 'nodejs' // ssh2 (FTP streaming) needs the Node runtime

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
      `SELECT twenty_object_type, twenty_record_id, expires_at, ftp_folder_path
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

    // FTP-folder shares: attachment id is `ftp-<base64url(filename)>`. Stream
    // the file straight off ANC's FTP, honoring HTTP Range so the big review
    // videos scrub without downloading whole. The filename is decoded to a bare
    // basename and joined to the share's folder — no caller-controlled path.
    if (attachmentId.startsWith('ftp-') && share.twenty_object_type === 'ftpFolder') {
      if (!share.ftp_folder_path) {
        return new NextResponse('Proof folder missing', { status: 500 })
      }
      let filename: string
      try {
        filename = Buffer.from(attachmentId.slice(4), 'base64url').toString('utf8')
      } catch {
        return new NextResponse('Bad file id', { status: 400 })
      }
      // Reject anything that isn't a plain filename in this folder.
      if (!filename || filename !== path.posix.basename(filename)) {
        return new NextResponse('Invalid file', { status: 400 })
      }
      const fullPath = path.posix.join(share.ftp_folder_path, filename)

      // Parse an optional Range header.
      const rangeHeader = request.headers.get('range')
      let range: { start: number; end?: number } | undefined
      if (rangeHeader) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim())
        if (m) {
          range = { start: Number(m[1]) }
          if (m[2]) range.end = Number(m[2])
        }
      }

      let opened
      try {
        opened = await openFileStream(fullPath, range)
      } catch (err) {
        console.error('[proof-share/file] ftp open failed:', err)
        return new NextResponse('Could not read proof file', { status: 502 })
      }
      const { stream, size, name, kind } = opened
      const { Readable } = await import('node:stream')
      const webStream = Readable.toWeb(stream) as unknown as ReadableStream

      const contentType =
        kind === 'video' ? `video/${(name.split('.').pop() || 'mp4').toLowerCase()}`
        : kind === 'image' ? `image/${(name.split('.').pop() || 'jpeg').toLowerCase().replace('jpg', 'jpeg')}`
        : kind === 'pdf' ? 'application/pdf'
        : 'application/octet-stream'

      const headers = new Headers({
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${name.replace(/[\r\n"\\]/g, '')}"`,
      })
      if (range) {
        const end = range.end ?? size - 1
        headers.set('Content-Range', `bytes ${range.start}-${end}/${size}`)
        headers.set('Content-Length', String(end - range.start + 1))
        return new NextResponse(webStream, { status: 206, headers })
      }
      headers.set('Content-Length', String(size))
      return new NextResponse(webStream, { status: 200, headers })
    }

    // Local design_request_files attachments are prefixed `file-<uuid>` and
    // stored either in Postgres bytea or MinIO. They never round-trip through
    // Twenty, so we short-circuit the Twenty flow entirely for them.
    if (attachmentId.startsWith('file-') && (share.twenty_object_type === 'localDesignRequest' || share.twenty_object_type === 'designRequest')) {
      const fileId = attachmentId.slice(5)
      const fileResult = await query(
        `UPDATE design_request_files
         SET view_count = COALESCE(view_count, 0) + 1,
             last_viewed_at = NOW()
         WHERE id = $1 AND design_request_id = $2
         RETURNING id, design_request_id, filename, mime_type, size_bytes, data, storage_key, storage_backend,
                   view_count, last_viewed_at
        `,
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
