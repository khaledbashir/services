import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { patchTwentyRecord } from '@/lib/proof-share'

/**
 * POST /api/proof-share/[token]/view
 *
 * Records that a proof link was viewed. Called from the client-facing page
 * on mount (fire-and-forget — doesn't block page rendering).
 *
 * Tracks:
 *   - view_count
 *   - last_viewed_at
 *   - last_viewed_ip
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const result = await query(
      `UPDATE proof_shares
       SET view_count = view_count + 1,
           last_viewed_at = NOW(),
           last_viewed_ip = $2
       WHERE token = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING twenty_object_type, twenty_record_id, view_count, last_viewed_at`,
      [token, ip]
    )

    // Sync view stats back to the Twenty record so the designer sees it
    if (result.rows.length > 0) {
      const row = result.rows[0]
      void patchTwentyRecord(row.twenty_object_type, row.twenty_record_id, {
        proofViewCount: row.view_count,
        proofLastViewedAt: row.last_viewed_at,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[proof-share/view] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
