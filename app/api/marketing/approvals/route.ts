export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

function itemTable(itemType: string): { table: string; statusColumn: string } | null {
  if (itemType === 'newsletter') return { table: 'newsletter_campaigns', statusColumn: 'status' }
  if (itemType === 'social') return { table: 'marketing_social_posts', statusColumn: 'state' }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const itemType = sp.get('itemType')
    const itemId = sp.get('itemId')
    const params: any[] = []
    const where: string[] = []

    if (itemType) {
      params.push(itemType)
      where.push(`a.item_type = $${params.length}`)
    }
    if (itemId) {
      params.push(itemId)
      where.push(`a.item_id = $${params.length}`)
    }

    const result = await query(
      `SELECT a.*
       FROM marketing_approval_requests a
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.requested_at DESC
       LIMIT 100`,
      params,
    )
    return NextResponse.json({ approvals: result.rows })
  } catch (err) {
    console.error('Error loading marketing approvals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const itemType = String(body.itemType || '').trim().toLowerCase()
    const itemId = String(body.itemId || '').trim()
    const target = itemTable(itemType)
    if (!target || !itemId) {
      return NextResponse.json({ error: 'Approval needs itemType newsletter/social and itemId' }, { status: 400 })
    }

    const action = String(body.action || 'request').trim().toLowerCase()
    if (!['request', 'approve', 'reject', 'changes_requested'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported approval action' }, { status: 400 })
    }

    if (action === 'request') {
      const result = await query(
        `INSERT INTO marketing_approval_requests
          (item_type, item_id, status, requested_by, approver_group, notes, metadata)
         VALUES ($1, $2, 'pending', $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [
          itemType,
          itemId,
          body.requestedBy || 'Marketing Hub',
          body.approverGroup || 'Jerry, Kirsten, Joe, Jireh, John',
          body.notes || null,
          JSON.stringify(body.metadata || {}),
        ],
      )
      await query(
        `UPDATE ${target.table}
         SET ${target.statusColumn} = 'pending_approval', updated_at = NOW()
         WHERE id = $1`,
        [itemId],
      )
      return NextResponse.json({ approval: result.rows[0] })
    }

    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested'
    const itemStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested'

    const result = await query(
      `UPDATE marketing_approval_requests
       SET status = $3,
           decided_by = $4,
           decided_at = NOW(),
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM marketing_approval_requests
         WHERE item_type = $1 AND item_id = $2
         ORDER BY requested_at DESC
         LIMIT 1
       )
       RETURNING *`,
      [itemType, itemId, status, body.decidedBy || 'Marketing Hub', body.notes || null],
    )

    await query(
      `UPDATE ${target.table}
       SET ${target.statusColumn} = $2, updated_at = NOW()
       WHERE id = $1`,
      [itemId, itemStatus],
    )

    return NextResponse.json({ approval: result.rows[0] || null })
  } catch (err) {
    console.error('Error updating marketing approval:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
