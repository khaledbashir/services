import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { notifyOps } from '@/lib/slack'

const MAX_DATA_URL_LENGTH = 8_000_000
function normalizeImage(input: any): { imageUrl: string; mimeType: string; filename: string | null } | null {
  if (!input?.data || typeof input.data !== 'string') return null
  const mimeType = typeof input.mimeType === 'string' && input.mimeType.startsWith('image/') ? input.mimeType : 'image/jpeg'
  const imageUrl = input.data.startsWith('data:') ? input.data : `data:${mimeType};base64,${input.data}`
  if (!imageUrl.startsWith('data:image/') || imageUrl.length > MAX_DATA_URL_LENGTH) return null
  return { imageUrl, mimeType, filename: typeof input.name === 'string' ? input.name.slice(0, 180) : null }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate token
    const venueResult = await query(
      `SELECT id FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal' }, { status: 404 })
    }

    const { ticket_id, body, image, caption } = await request.json()
    const normalizedImage = normalizeImage(image)
    if (!ticket_id || (!body && !normalizedImage)) {
      return NextResponse.json({ error: 'ticket_id and body or image required' }, { status: 400 })
    }

    // Verify ticket belongs to this venue
    const ticketResult = await query(
      `SELECT id FROM tickets WHERE id = $1 AND venue_id = $2`,
      [ticket_id, venueResult.rows[0].id]
    )
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Add as external comment (visible to both sides) from Claw
    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    const comment = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, false, NOW())
       RETURNING id`,
      [ticket_id, CLAW_STAFF_ID, body || (caption ? `Photo: ${caption}` : 'Photo attached')]
    )
    if (normalizedImage) {
      await query(
        `INSERT INTO ticket_attachments (ticket_id, comment_id, filename, mime_type, image_url, caption, uploaded_by, is_internal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [ticket_id, comment.rows[0].id, normalizedImage.filename, normalizedImage.mimeType, normalizedImage.imageUrl, caption || null, CLAW_STAFF_ID]
      )
    }

    const ticketInfo = await query('SELECT t.title, t.ticket_number, v.name as venue_name, v.slack_channel_id FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1', [ticket_id])
    if (ticketInfo.rows[0]) {
      const t = ticketInfo.rows[0]
      const caseNum = String(t.ticket_number).padStart(8, '0')
      const preview = body || (normalizedImage ? 'Photo attached' : '')
      notifyOps(':speech_balloon:', `*Portal comment* on Case #${caseNum} (${t.venue_name}):\n> ${preview.substring(0, 200)}${preview.length > 200 ? '...' : ''}`, { label: 'View Ticket', url: `https://abc-anc-services.izcgmb.easypanel.host/tickets/${ticket_id}` }, t.slack_channel_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error adding portal comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
