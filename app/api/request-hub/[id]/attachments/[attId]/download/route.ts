export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; attId: string } }
) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT file_name, mime_type, data_url, external_url FROM request_hub_attachments
     WHERE id = $1 AND request_id = $2`,
    [params.attId, params.id]
  )
  const row = res.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.external_url) return NextResponse.redirect(row.external_url)
  if (!row.data_url) return NextResponse.json({ error: 'No file data' }, { status: 404 })

  const match = String(row.data_url).match(/^data:([^;]+);base64,(.*)$/s)
  if (!match) return NextResponse.json({ error: 'Corrupt attachment' }, { status: 500 })
  const buf = Buffer.from(match[2], 'base64')
  return new NextResponse(buf, {
    headers: {
      'Content-Type': row.mime_type || match[1] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${String(row.file_name || 'attachment').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
