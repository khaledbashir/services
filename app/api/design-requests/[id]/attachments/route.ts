export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT id, filename, mime_type, size_bytes, created_at
     FROM design_request_attachments
     WHERE design_request_id = $1
     ORDER BY created_at DESC`,
    [params.id],
  )
  return NextResponse.json({
    attachments: res.rows.map((row: any) => ({
      ...row,
      size_bytes: Number(row.size_bytes || 0),
      download_url: `/api/design-requests/${params.id}/attachments/${row.id}/download`,
    })),
  })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const exists = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (exists.rows.length === 0) return NextResponse.json({ error: 'Design request not found' }, { status: 404 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing "file" part' }, { status: 400 })
  if (file.size > 250 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 250MB limit' }, { status: 413 })

  const filename = (file as any).name || 'attachment'
  const bytes = Buffer.from(await file.arrayBuffer())
  const inserted = await query(
    `INSERT INTO design_request_attachments (design_request_id, filename, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, filename, mime_type, size_bytes, created_at`,
    [params.id, filename, file.type || 'application/octet-stream', bytes.byteLength, bytes, auth.userId],
  )
  return NextResponse.json({
    attachment: {
      ...inserted.rows[0],
      size_bytes: Number(inserted.rows[0].size_bytes || 0),
      download_url: `/api/design-requests/${params.id}/attachments/${inserted.rows[0].id}/download`,
    },
  })
}
