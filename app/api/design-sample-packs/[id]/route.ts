import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

const ALLOWED_FIELDS = new Set([
  'name',
  'description',
  'client_label',
  'client_email',
  'expires_at',
])

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const packRes = await query(
      `SELECT p.id, p.name, p.description, p.client_label, p.client_email,
              p.share_token, p.expires_at, p.view_count, p.last_viewed_at,
              p.created_at, p.updated_at,
              p.created_by, cb.full_name as created_by_name
       FROM design_sample_packs p
       LEFT JOIN staff cb ON p.created_by = cb.id
       WHERE p.id = $1`,
      [params.id],
    )
    const pack = packRes.rows[0]
    if (!pack) {
      return NextResponse.json({ error: 'Sample pack not found' }, { status: 404 })
    }
    const itemsRes = await query(
      `SELECT id, label, url, caption, position, created_at
       FROM design_sample_pack_items
       WHERE pack_id = $1
       ORDER BY position ASC, created_at ASC`,
      [params.id],
    )
    return NextResponse.json({ pack: { ...pack, items: itemsRes.rows } })
  } catch (err) {
    console.error('Error fetching sample pack:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    let i = 1

    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue
      let value = body[key]
      if (typeof value === 'string') value = value.trim() || null
      if (key === 'name' && (!value || typeof value !== 'string')) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      updates.push(`${key} = $${i++}`)
      values.push(value)
    }
    if (!updates.length) {
      // Allow item replacement without other field changes — fall through to
      // the items branch below instead of bailing out.
    } else {
      values.push(params.id)
      await query(
        `UPDATE design_sample_packs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
        values,
      )
    }

    if (Array.isArray(body?.items)) {
      // Full replace: simpler than diffing reorder operations and matches
      // how Alexis edits a pack (paste in the new ordered list).
      await query('DELETE FROM design_sample_pack_items WHERE pack_id = $1', [params.id])
      const valuesSql: string[] = []
      const params2: any[] = []
      let j = 1
      body.items.forEach((item: any, index: number) => {
        const url = String(item?.url || '').trim()
        if (!url) return
        valuesSql.push(`($${j++}, $${j++}, $${j++}, $${j++}, $${j++})`)
        params2.push(
          params.id,
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
          params2,
        )
      }
      await query('UPDATE design_sample_packs SET updated_at = NOW() WHERE id = $1', [params.id])
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error updating sample pack:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await query('DELETE FROM design_sample_packs WHERE id = $1', [params.id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting sample pack:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
