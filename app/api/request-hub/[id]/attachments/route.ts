export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { logHubActivity } from '@/lib/request-hub/core'

const MAX_BYTES = 15 * 1024 * 1024 // 15MB — stored inline as a data URL

// POST /api/request-hub/[id]/attachments — multipart file upload, or JSON
// { url, label } to attach an external link (OneDrive/SharePoint/anything).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const parent = await query(`SELECT id, requester_id FROM request_hub_items WHERE id = $1`, [params.id])
  if (!parent.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null)
    const url = String(body?.url || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'A valid http(s) URL is required' }, { status: 400 })
    }
    const res = await query(
      `INSERT INTO request_hub_attachments (request_id, file_name, external_url, source, uploaded_by, uploaded_by_name)
       VALUES ($1, $2, $3, 'link', $4, $5) RETURNING id, file_name, external_url, source, created_at`,
      [params.id, String(body?.label || url).slice(0, 200), url, auth.userId, auth.fullName]
    )
    await logHubActivity({
      requestId: params.id,
      eventType: 'attachment',
      actor: { userId: auth.userId, fullName: auth.fullName },
      toValue: url,
    })
    return NextResponse.json({ attachment: res.rows[0] }, { status: 201 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data or JSON' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (15MB max) — attach a link instead' }, { status: 413 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const mime = file.type || 'application/octet-stream'
  const name = (file as any).name || 'attachment'
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

  const res = await query(
    `INSERT INTO request_hub_attachments (request_id, file_name, mime_type, size_bytes, data_url, source, uploaded_by, uploaded_by_name)
     VALUES ($1, $2, $3, $4, $5, 'upload', $6, $7)
     RETURNING id, file_name, mime_type, size_bytes, source, created_at`,
    [params.id, String(name).slice(0, 200), mime, file.size, dataUrl, auth.userId, auth.fullName]
  )
  await logHubActivity({
    requestId: params.id,
    eventType: 'attachment',
    actor: { userId: auth.userId, fullName: auth.fullName },
    toValue: String(name),
  })
  const row = res.rows[0]
  return NextResponse.json(
    {
      attachment: {
        ...row,
        size_bytes: Number(row.size_bytes || 0),
        download_url: `/api/request-hub/${params.id}/attachments/${row.id}/download`,
      },
    },
    { status: 201 }
  )
}
