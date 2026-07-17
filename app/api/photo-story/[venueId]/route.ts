export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

// Account visual story data: every swept photo for a venue, grouped by week,
// with AI titles/categories and stats. Powers /photo-story/[venueId].
export async function GET(
  request: NextRequest,
  { params }: { params: { venueId: string } },
) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const { venueId } = params
  const venueResult = await query(`SELECT id, name FROM venues WHERE id = $1`, [venueId])
  const venue = venueResult.rows[0]
  if (!venue) return NextResponse.json({ error: 'venue not found' }, { status: 404 })

  const photos = await query(
    `SELECT id, ai_title, ai_category, ai_description, ai_tags, poster, posted_at,
            web_url, slack_permalink, share_token
     FROM slack_photo_files
     WHERE venue_id = $1 AND thumb IS NOT NULL
     ORDER BY posted_at DESC`,
    [venueId]
  )

  // Stable share token for the client-facing story page
  const share = await query(
    `INSERT INTO photo_story_shares (venue_id, token)
     VALUES ($1, encode(gen_random_bytes(24), 'hex'))
     ON CONFLICT (venue_id) DO UPDATE SET venue_id = EXCLUDED.venue_id
     RETURNING token`,
    [venueId]
  )

  const categories: Record<string, number> = {}
  for (const p of photos.rows) {
    const c = p.ai_category || 'Uncategorized'
    categories[c] = (categories[c] || 0) + 1
  }

  return NextResponse.json({
    venue,
    shareToken: share.rows[0]?.token || null,
    stats: {
      total: photos.rows.length,
      categories,
      firstPhoto: photos.rows.at(-1)?.posted_at ?? null,
      lastPhoto: photos.rows[0]?.posted_at ?? null,
    },
    photos: photos.rows.map(p => ({
      id: p.id,
      title: p.ai_title,
      category: p.ai_category,
      description: p.ai_description,
      tags: p.ai_tags,
      poster: p.poster,
      postedAt: p.posted_at,
      imageUrl: `/api/photos/${p.id}/img`,
      salesLibraryUrl: p.web_url,
      slackUrl: p.slack_permalink,
    })),
  })
}
