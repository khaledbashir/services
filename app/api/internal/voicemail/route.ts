import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'

const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'anc-internal-2026'

// Replaces the Zendesk leg of the Zoom Phone → Zapier voicemail pipeline.
// Zapier posts parsed voicemail data here; we create a ticket, attach the
// recording, transcription, and caller number, and ping Slack.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-api-key') || ''
    if (authHeader !== INTERNAL_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as {
      caller_number?: string
      caller_name?: string
      transcription?: string
      audio_url?: string
      received_at?: string
      extension?: string
      priority?: 'low' | 'medium' | 'high' | 'urgent'
    }

    const callerNumber = (body.caller_number || '').toString().trim() || 'Unknown'
    const callerName = (body.caller_name || '').toString().trim() || null
    const transcription = (body.transcription || '').toString().trim()
    const audioUrl = (body.audio_url || '').toString().trim()
    const extension = (body.extension || '').toString().trim()
    const priority = body.priority || 'urgent'

    const title = callerName
      ? `Voicemail from ${callerName} (${callerNumber})`
      : `Voicemail from ${callerNumber}`

    const descriptionParts: string[] = []
    if (callerNumber) descriptionParts.push(`Caller: ${callerNumber}`)
    if (callerName) descriptionParts.push(`Name: ${callerName}`)
    if (extension) descriptionParts.push(`Extension: ${extension}`)
    if (body.received_at) descriptionParts.push(`Received: ${body.received_at}`)
    if (transcription) descriptionParts.push(`\nTranscription:\n${transcription}`)
    if (audioUrl) descriptionParts.push(`\nListen: ${audioUrl}`)
    const description = descriptionParts.join('\n')

    const slaResult = await query(
      `SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`,
      [priority]
    )
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    const result = await query(
      `INSERT INTO tickets (created_by, title, description, priority, status, category, source, sla_response_due, sla_resolution_due, contact_phone, original_message)
       VALUES ($1, $2, $3, $4, 'new', 'voicemail', 'voicemail', $5, $6, $7, $8)
       RETURNING id, ticket_number, title, priority, status, category`,
      [CLAW_STAFF_ID, title, description, priority, slaResponseDue, slaResolutionDue, callerNumber, transcription || null]
    )

    const ticket = result.rows[0]

    const channelId = process.env.SLACK_SUPPORT_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category,
        priority: ticket.priority,
        venue_name: 'Support Hotline',
        description: transcription || description,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_created', 'ticket', $1, $2, $3)`,
      [ticket.id, CLAW_STAFF_ID, JSON.stringify({
        entity_name: title,
        venue_name: 'Support Hotline',
        priority,
        category: 'voicemail',
        source: 'voicemail',
      })]
    )

    return NextResponse.json({
      ok: true,
      ticket_number: ticket.ticket_number,
      ticket_id: ticket.id,
    })
  } catch (err) {
    console.error('Error creating voicemail ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
