import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'

const MAX_DATA_URL_LENGTH = 8_000_000

function normalizeImage(input: any): { imageUrl: string; mimeType: string; filename: string | null } | null {
  if (!input?.data || typeof input.data !== 'string') return null
  const mimeType = typeof input.mimeType === 'string' && input.mimeType.startsWith('image/')
    ? input.mimeType
    : 'image/jpeg'
  const imageUrl = input.data.startsWith('data:')
    ? input.data
    : `data:${mimeType};base64,${input.data}`
  if (!imageUrl.startsWith('data:image/')) return null
  if (imageUrl.length > MAX_DATA_URL_LENGTH) return null
  return {
    imageUrl,
    mimeType,
    filename: typeof input.name === 'string' ? input.name.slice(0, 180) : null,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const image = normalizeImage(body.image)
    if (!image) {
      return NextResponse.json({ error: 'A valid image attachment is required' }, { status: 400 })
    }

    const ticket = await query('SELECT id, title, venue_id FROM tickets WHERE id = $1', [params.id])
    if (!ticket.rows[0]) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const attachment = await query(
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
        image.filename,
        image.mimeType,
        image.imageUrl,
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
        filename: image.filename,
      })]
    )
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [params.id])

    return NextResponse.json({ attachment: attachment.rows[0] })
  } catch (err) {
    console.error('Error adding ticket attachment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
