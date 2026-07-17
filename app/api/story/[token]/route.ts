export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Public, client-facing story data behind an unguessable token. Curated:
// internal issue documentation and screenshots stay out — clients see the
// venue, the installs, and the technology running.
const CLIENT_FACING_CATEGORIES = [
  'Install / Construction',
  'Display Content',
  'Venue / Event',
  'Rack / Control Room',
  'Equipment',
]

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params
  if (!/^[a-f0-9]{32,64}$/.test(token || '')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const share = await query(
    `SELECT s.venue_id, v.name FROM photo_story_shares s
     JOIN venues v ON v.id = s.venue_id WHERE s.token = $1`,
    [token]
  )
  const row = share.rows[0]
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const photos = await query(
    `SELECT id, ai_title, ai_category, ai_description, posted_at, share_token
     FROM slack_photo_files
     WHERE venue_id = $1 AND thumb IS NOT NULL AND share_token IS NOT NULL
       AND COALESCE(ai_category, '') = ANY($2::text[])
     ORDER BY posted_at DESC`,
    [row.venue_id, CLIENT_FACING_CATEGORIES]
  )

  return NextResponse.json({
    venue: { name: row.name },
    photos: photos.rows.map(p => ({
      title: p.ai_title,
      category: p.ai_category,
      description: p.ai_description,
      postedAt: p.posted_at,
      imageUrl: `/api/photos/shared/${p.share_token}`,
    })),
  })
}
