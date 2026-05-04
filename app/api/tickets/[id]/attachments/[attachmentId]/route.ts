import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'

// Delete a single attachment. Allowed for the original uploader, or any
// manager/tech_support/admin (so anyone with ticket-edit rights can clean
// up mistakes — like a stray song file uploaded while testing).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await query(
      `SELECT id, ticket_id, filename, uploaded_by FROM ticket_attachments
       WHERE id = $1 AND ticket_id = $2`,
      [params.attachmentId, params.id]
    )
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const isOwner = existing.rows[0].uploaded_by === user.userId
    const canManage = user.role === 'admin' || user.role === 'tech_support' || user.role === 'manager'
    if (!isOwner && !canManage) {
      return NextResponse.json({ error: 'Not allowed to delete this attachment' }, { status: 403 })
    }

    await query('DELETE FROM ticket_attachments WHERE id = $1', [params.attachmentId])

    // If this was the cover image (tickets.image_url), clear it too so the
    // ticket card / Slack notifications don't keep pointing at a deleted blob.
    await query(
      `UPDATE tickets SET image_url = NULL
       WHERE id = $1
         AND image_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM ticket_attachments
           WHERE ticket_id = $1 AND mime_type LIKE 'image/%'
         )`,
      [params.id]
    )

    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_attachment_removed', 'ticket', $1, $2, $3)`,
      [params.id, user.userId, JSON.stringify({ filename: existing.rows[0].filename })]
    )
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [params.id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting ticket attachment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
