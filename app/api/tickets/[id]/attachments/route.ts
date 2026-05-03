import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { normalizeAttachment } from '@/lib/ticket-attachments'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const attachment = normalizeAttachment(body.attachment ?? body.image)
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment is required (image, video, PDF, or document up to 22 MB)' }, { status: 400 })
    }

    const ticket = await query('SELECT id, title, venue_id FROM tickets WHERE id = $1', [params.id])
    if (!ticket.rows[0]) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const inserted = await query(
      `INSERT INTO ticket_attachments (ticket_id, filename, mime_type, image_url, caption, uploaded_by, is_internal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         ticket_id,
         comment_id,
         filename,
         mime_type,
         image_url,
         caption,
         is_internal,
         TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as created_date`,
      [
        params.id,
        attachment.filename,
        attachment.mimeType,
        attachment.imageUrl,
        typeof body.caption === 'string' ? body.caption.trim().slice(0, 500) || null : null,
        user.userId,
        Boolean(body.is_internal),
      ]
    )

    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_attachment_added', 'ticket', $1, $2, $3)`,
      [params.id, user.userId, JSON.stringify({
        entity_name: ticket.rows[0].title,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
      })]
    )
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [params.id])

    return NextResponse.json({ attachment: inserted.rows[0] })
  } catch (err) {
    console.error('Error adding ticket attachment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
