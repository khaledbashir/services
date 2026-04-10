import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

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

    await query(
      `UPDATE proof_shares
       SET view_count = view_count + 1,
           last_viewed_at = NOW(),
           last_viewed_ip = $2
       WHERE token = $1`,
      [token, ip]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[proof-share/view] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
