import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

function newToken(): string {
  // URL-safe slug, 20 chars. Long enough that an unguessable share URL stays
  // unguessable, short enough to read aloud if Alexis ever needs to.
  return randomBytes(15).toString('base64url')
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const result = await query(
      `SELECT p.id, p.name, p.description, p.client_label, p.client_email,
              p.share_token, p.expires_at, p.view_count, p.last_viewed_at,
              p.created_at, p.updated_at,
              p.created_by, cb.full_name as created_by_name,
              (SELECT COUNT(*)::int FROM design_sample_pack_items i WHERE i.pack_id = p.id) as item_count
       FROM design_sample_packs p
       LEFT JOIN staff cb ON p.created_by = cb.id
       ORDER BY p.updated_at DESC`,
    )
    return NextResponse.json({ packs: result.rows })
  } catch (err) {
    console.error('Error listing sample packs:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const items = Array.isArray(body?.items) ? body.items : []

    const packResult = await query(
      `INSERT INTO design_sample_packs (
        name, description, client_label, client_email,
        share_token, expires_at, created_by
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7
      )
      RETURNING id, name, share_token, created_at`,
      [
        name,
        body.description ? String(body.description).trim() || null : null,
        body.client_label ? String(body.client_label).trim() || null : null,
        body.client_email ? String(body.client_email).trim() || null : null,
        newToken(),
        body.expires_at || null,
        auth.userId || null,
      ],
    )
    const pack = packResult.rows[0]

    if (items.length) {
      // Bulk-insert items so a 20-link pack is one round trip, not 20.
      const valuesSql: string[] = []
      const params: any[] = []
      let i = 1
      items.forEach((item: any, index: number) => {
        const url = String(item?.url || '').trim()
        if (!url) return
        valuesSql.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`)
        params.push(
          pack.id,
          item?.label ? String(item.label).trim() || null : null,
          url,
          item?.caption ? String(item.caption).trim() || null : null,
          typeof item?.position === 'number' ? item.position : index,
        )
      })
      if (valuesSql.length) {
        await query(
          `INSERT INTO design_sample_pack_items (pack_id, label, url, caption, position)
           VALUES ${valuesSql.join(', ')}`,
          params,
        )
      }
    }

    return NextResponse.json({ pack })
  } catch (err) {
    console.error('Error creating sample pack:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
