import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'

// Merge this ticket INTO target_ticket_id (the primary). Comments move to
// the primary, source is closed with a pointer, both sides get an activity
// log entry.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { target_ticket_id?: string }
    const targetId = (body.target_ticket_id || '').toString().trim()
    if (!targetId) return NextResponse.json({ error: 'target_ticket_id is required' }, { status: 400 })
    if (targetId === params.id) return NextResponse.json({ error: 'Cannot merge a ticket into itself' }, { status: 400 })

    const sourceRes = await query(
      `SELECT id, ticket_number, title, status, merged_into_ticket_id FROM tickets WHERE id = $1`,
      [params.id]
    )
    const targetRes = await query(
      `SELECT id, ticket_number, title, status, merged_into_ticket_id FROM tickets WHERE id = $1`,
      [targetId]
    )
    if (sourceRes.rows.length === 0) return NextResponse.json({ error: 'Source ticket not found' }, { status: 404 })
    if (targetRes.rows.length === 0) return NextResponse.json({ error: 'Target ticket not found' }, { status: 404 })

    const source = sourceRes.rows[0]
    const target = targetRes.rows[0]
    if (source.merged_into_ticket_id) {
      return NextResponse.json({ error: 'Source ticket is already merged' }, { status: 400 })
    }
    if (target.merged_into_ticket_id) {
      return NextResponse.json({ error: 'Target ticket has itself been merged into another' }, { status: 400 })
    }

    // Move comments from source → target (preserve original authors and timestamps)
    const moved = await query(
      `UPDATE ticket_comments SET ticket_id = $1 WHERE ticket_id = $2 RETURNING id`,
      [targetId, params.id]
    )

    // Close source and point it at the target
    await query(
      `UPDATE tickets
       SET status = 'closed',
           resolved_at = COALESCE(resolved_at, NOW()),
           merged_into_ticket_id = $1,
           resolution_notes = CASE
             WHEN COALESCE(resolution_notes, '') = '' THEN 'Merged into T-' || LPAD($2::text, 5, '0')
             ELSE resolution_notes || E'\n\nMerged into T-' || LPAD($2::text, 5, '0')
           END,
           updated_at = NOW()
       WHERE id = $3`,
      [targetId, target.ticket_number, params.id]
    )

    // Drop a system comment on the primary so the merge is visible in the timeline
    await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal)
       VALUES ($1, $2, $3, true)`,
      [
        targetId,
        user.userId,
        `Merged T-${String(source.ticket_number).padStart(5, '0')} (${source.title}) into this ticket.`,
      ]
    )

    // Activity log both sides
    for (const [ticketId, action, entityName, other] of [
      [params.id, 'ticket_merged', source.title, target.ticket_number],
      [targetId, 'ticket_merged_in', target.title, source.ticket_number],
    ] as const) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ($1, 'ticket', $2, $3, $4)`,
        [
          action,
          ticketId,
          user.userId,
          JSON.stringify({ entity_name: entityName, other_ticket_number: other }),
        ]
      )
    }

    return NextResponse.json({
      ok: true,
      source_ticket_id: params.id,
      target_ticket_id: targetId,
      comments_moved: moved.rowCount || 0,
    })
  } catch (err) {
    console.error('Error merging tickets:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
