import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { isValidInternalCategory } from '@/lib/design-internal-category'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await query(
      `SELECT design_request_id, category, notes, set_at,
              set_by, s.full_name as set_by_name
       FROM design_request_internal_categories c
       LEFT JOIN staff s ON c.set_by = s.id
       WHERE design_request_id = $1`,
      [params.id],
    )
    return NextResponse.json({ category: res.rows[0] || null })
  } catch (err) {
    console.error('Error reading internal category:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const category = body?.category as string | null
    const notes = typeof body?.notes === 'string' ? body.notes.trim() || null : null

    if (category === null || category === '') {
      // Clear the tag — request reverts to "regular client work".
      await query('DELETE FROM design_request_internal_categories WHERE design_request_id = $1', [params.id])
      return NextResponse.json({ category: null })
    }

    if (!isValidInternalCategory(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    await query(
      `INSERT INTO design_request_internal_categories (design_request_id, category, notes, set_by, set_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (design_request_id)
       DO UPDATE SET category = EXCLUDED.category, notes = EXCLUDED.notes, set_by = EXCLUDED.set_by, set_at = NOW()`,
      [params.id, category, notes, auth.userId || null],
    )

    return NextResponse.json({ category: { design_request_id: params.id, category, notes } })
  } catch (err) {
    console.error('Error setting internal category:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
