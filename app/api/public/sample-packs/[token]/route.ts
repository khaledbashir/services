import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Public read for the share page. No auth — that's the point of the share
// token. Increments view_count + last_viewed_at on each load so Alexis can
// see whether the sponsor actually opened the link.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const packRes = await query(
      `SELECT id, name, description, client_label, expires_at
       FROM design_sample_packs
       WHERE share_token = $1`,
      [params.token],
    )
    const pack = packRes.rows[0]
    if (!pack) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 })
    }
    const itemsRes = await query(
      `SELECT id, label, url, caption, position
       FROM design_sample_pack_items
       WHERE pack_id = $1
       ORDER BY position ASC, created_at ASC`,
      [pack.id],
    )
    // Fire-and-forget view tracking.
    query(
      `UPDATE design_sample_packs
       SET view_count = view_count + 1, last_viewed_at = NOW()
       WHERE id = $1`,
      [pack.id],
    ).catch(() => {})

    return NextResponse.json({
      pack: {
        name: pack.name,
        description: pack.description,
        client_label: pack.client_label,
        items: itemsRes.rows,
      },
    })
  } catch (err) {
    console.error('Error reading public sample pack:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
