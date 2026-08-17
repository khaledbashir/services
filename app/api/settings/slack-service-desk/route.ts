export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { isAuthError, requireRole } from '@/lib/rbac'
import { dashboardUrl } from '@/lib/app-url'

const PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])

async function listChannels() {
  const result = await query(
    `SELECT src.id, src.channel_id, src.channel_name, src.venue_id, v.name AS venue_name,
            src.enabled, src.auto_create_tickets, src.silent_mode, src.triage_channel_id,
            src.default_priority, src.default_category, src.request_type, src.notes,
            src.created_at, src.updated_at
     FROM slack_request_channels src
     LEFT JOIN venues v ON v.id = src.venue_id
     ORDER BY COALESCE(src.channel_name, src.channel_id) ASC`,
  )
  return result.rows
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  return NextResponse.json({
    channels: await listChannels(),
    ticketEmojis: (process.env.SLACK_TICKET_EMOJIS || 'ticket,admission_tickets').split(',').map(s => s.trim()).filter(Boolean),
    maintenanceEmojis: (process.env.SLACK_MAINTENANCE_EMOJIS || 'wrench,hammer_and_wrench,toolbox').split(',').map(s => s.trim()).filter(Boolean),
    walkthroughEmojis: (process.env.SLACK_WALKTHROUGH_EMOJIS || 'walking,clipboard').split(',').map(s => s.trim()).filter(Boolean),
    requestUrl: dashboardUrl('/api/slack/events'),
    commandUrl: dashboardUrl('/api/slack/command'),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const channelId = typeof body.channel_id === 'string' ? body.channel_id.trim() : ''
  const venueId = typeof body.venue_id === 'string' ? body.venue_id.trim() : ''
  if (!channelId || !venueId) {
    return NextResponse.json({ error: 'channel_id and venue_id are required' }, { status: 400 })
  }

  const priority = PRIORITIES.has(String(body.default_priority)) ? String(body.default_priority) : 'medium'
  await query(
    `INSERT INTO slack_request_channels (
       channel_id, channel_name, venue_id, enabled, auto_create_tickets, silent_mode,
       triage_channel_id, default_priority, default_category, request_type, notes, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (channel_id) DO UPDATE SET
       channel_name = EXCLUDED.channel_name,
       venue_id = EXCLUDED.venue_id,
       enabled = EXCLUDED.enabled,
       auto_create_tickets = EXCLUDED.auto_create_tickets,
       silent_mode = EXCLUDED.silent_mode,
       triage_channel_id = EXCLUDED.triage_channel_id,
       default_priority = EXCLUDED.default_priority,
       default_category = EXCLUDED.default_category,
       request_type = EXCLUDED.request_type,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      channelId,
      typeof body.channel_name === 'string' ? body.channel_name.trim() || null : null,
      venueId,
      body.enabled !== false,
      body.auto_create_tickets === true,
      body.silent_mode === true,
      typeof body.triage_channel_id === 'string' ? body.triage_channel_id.trim() || null : null,
      priority,
      typeof body.default_category === 'string' ? body.default_category.trim() || 'slack' : 'slack',
      typeof body.request_type === 'string' ? body.request_type.trim() || 'Support' : 'Support',
      typeof body.notes === 'string' ? body.notes.trim() || null : null,
    ],
  )

  return NextResponse.json({ channels: await listChannels() })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await query(`DELETE FROM slack_request_channels WHERE id = $1`, [id])
  return NextResponse.json({ channels: await listChannels() })
}
