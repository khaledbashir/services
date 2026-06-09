import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT filename, mime_type, data
     FROM cg_design_attachments
     WHERE id = $1 AND cg_design_request_id = $2`,
    [params.attachmentId, params.id],
  )
  const row = res.rows[0]
  if (!row) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  return new NextResponse(row.data, {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${String(row.filename || 'attachment').replace(/"/g, '')}"`,
    },
  })
}
