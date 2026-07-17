export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Public thumbnail by unguessable share token — same trust model as the proof
// share links. CRM notes embed these so field photos render on account records
// for anyone viewing the CRM, without a dashboard session.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params
  if (!/^[a-f0-9]{32,64}$/.test(token || '')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const result = await query(
    `SELECT thumb, thumb_mime FROM slack_photo_files WHERE share_token = $1`,
    [token]
  )
  const row = result.rows[0]
  if (!row?.thumb) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return new NextResponse(row.thumb, {
    status: 200,
    headers: {
      'Content-Type': row.thumb_mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  })
}
