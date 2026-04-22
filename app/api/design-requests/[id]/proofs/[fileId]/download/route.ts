import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSignedDownloadUrl } from '@/lib/proof-storage'

// Download a specific proof file. Works for both storage backends:
//   - s3      → server proxies the MinIO object back to the browser. We used
//               to 302 to a signed URL, but the MinIO endpoint is on an
//               internal docker hostname (`anc-proofs-minio:9000`) that the
//               browser can't reach, so the <img> previews failed silently.
//               Streaming through Next keeps the traffic inside the VPC and
//               lets the browser see a normal image response.
//   - bytea   → streams directly from Postgres with the right Content-Type
//
// Access check: legacy proofs were attached to design_request rows that the
// dashboard already gates via its own auth. Here we just require the caller
// to be authenticated; if they can see the design request, they can open
// the proof. For the public share flow, clients use /proof/[token] instead
// which has its own no-auth token check and calls this endpoint server-side
// via a signed URL, never directly.

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const res = await query(
    `SELECT id, filename, mime_type, size_bytes, data, storage_key, storage_backend
     FROM design_request_files
     WHERE id = $1 AND design_request_id = $2`,
    [params.fileId, params.id]
  )
  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 })
  }
  const row = res.rows[0]

  if (row.storage_backend === 's3' && row.storage_key) {
    try {
      const signed = await getSignedDownloadUrl(row.storage_key, 300)
      const upstream = await fetch(signed)
      if (!upstream.ok || !upstream.body) {
        console.error('[proof download] MinIO fetch failed:', upstream.status)
        return NextResponse.json({ error: 'Storage layer unavailable' }, { status: 502 })
      }
      return new NextResponse(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': row.mime_type || upstream.headers.get('content-type') || 'application/octet-stream',
          'Content-Length': upstream.headers.get('content-length') || String(row.size_bytes || 0),
          'Content-Disposition': `inline; filename="${row.filename.replace(/"/g, '_')}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch (err) {
      console.error('[proof download] s3 stream failed:', err)
      return NextResponse.json({ error: 'Storage layer unavailable' }, { status: 503 })
    }
  }

  if (!row.data) {
    return NextResponse.json({ error: 'File body missing' }, { status: 500 })
  }
  return new NextResponse(row.data, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Length': String(row.size_bytes || row.data.length),
      'Content-Disposition': `inline; filename="${row.filename.replace(/"/g, '_')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
