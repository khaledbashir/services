import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// POST /api/walkthroughs/nocodb/upload  (multipart/form-data with field "file")
//
// Proxies the file into NocoDB storage and returns the attachment metadata
// the form can stash and pass back into POST /api/walkthroughs/nocodb on
// final submit. Keeps the user's PAT out of the browser.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    if (!buf.length) return NextResponse.json({ error: 'empty file' }, { status: 400 })

    const uploaded = await NocoOps.uploadFile({
      filename: file.name || 'upload',
      contentType: file.type || 'application/octet-stream',
      body: buf,
      pathHint: 'walkthroughs',
    })
    return NextResponse.json({ ok: true, attachments: uploaded })
  } catch (err: any) {
    console.error('[walkthroughs/nocodb/upload]', err)
    return NextResponse.json({ error: err?.message || 'upload failed' }, { status: 502 })
  }
}
