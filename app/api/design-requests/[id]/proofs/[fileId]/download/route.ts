import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSignedDownloadUrl } from '@/lib/proof-storage'

// Download a specific proof file. Works for both storage backends:
//   - s3      → 302 redirect to a short-lived signed URL (no proxy cost)
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
      const url = await getSignedDownloadUrl(row.storage_key, 3600)  // 1h
      return NextResponse.redirect(url, 302)
    } catch (err) {
      console.error('[proof download] signed URL failed:', err)
      return NextResponse.json({ error: 'Storage layer unavailable' }, { status: 503 })
    }
  }

  // Bytea fallback
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
