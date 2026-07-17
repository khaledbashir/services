export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

// Serves the in-DB thumbnail for a swept Slack photo. The filed originals live
// in the Sales OneDrive library, which most dashboard users can't open — the
// gallery renders from this copy instead.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const { id } = params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const result = await query(
    `SELECT thumb, thumb_mime FROM slack_photo_files WHERE id = $1`,
    [Number(id)]
  )
  const row = result.rows[0]
  if (!row?.thumb) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return new NextResponse(row.thumb, {
    status: 200,
    headers: {
      'Content-Type': row.thumb_mime || 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
