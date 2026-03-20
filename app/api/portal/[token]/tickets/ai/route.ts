import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate token
    const venueResult = await query(
      `SELECT id, name FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal' }, { status: 404 })
    }

    const venue = venueResult.rows[0]
    const { message } = await request.json()

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Please describe the issue' }, { status: 400 })
    }

    // Use AI to parse the issue (OpenAI-compatible API)
    const aiResponse = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `You are a support ticket parser for ANC Sports venue services. Given a client's issue description, extract:
- title: a clear, concise ticket title (max 80 chars)
- category: one of: hardware, software, content, operational, general
- priority: one of: low, medium, high, critical
- description: a clean, professional version of their description

Respond ONLY with valid JSON, no other text:
{"title":"...","category":"...","priority":"...","description":"..."}`
          },
          { role: 'user', content: `Venue: ${venue.name}\n\nClient says: "${message}"` }
        ],
      }),
    })

    if (!aiResponse.ok) {
      // Fallback: create ticket without AI parsing
      const CLAW_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
      const result = await query(
        `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by)
         VALUES ($1, $2, $3, 'general', 'medium', 'open', $4)
         RETURNING id, ticket_number, title, category, priority, status`,
        [venue.id, message.substring(0, 80), message, CLAW_ID]
      )
      return NextResponse.json({ ticket: result.rows[0], ai_parsed: false })
    }

    const aiData = await aiResponse.json()
    const aiText = aiData.choices?.[0]?.message?.content || ''

    let parsed: { title: string; category: string; priority: string; description: string }
    try {
      parsed = JSON.parse(aiText)
    } catch {
      // Fallback
      parsed = { title: message.substring(0, 80), category: 'general', priority: 'medium', description: message }
    }

    // Validate category and priority
    const validCategories = ['hardware', 'software', 'content', 'operational', 'general']
    const validPriorities = ['low', 'medium', 'high', 'critical']
    if (!validCategories.includes(parsed.category)) parsed.category = 'general'
    if (!validPriorities.includes(parsed.priority)) parsed.priority = 'medium'

    // Auto-assignment
    const ruleResult = await query(
      `SELECT assign_to FROM assignment_rules WHERE is_active = true
       AND (category IS NULL OR category = $1) AND (venue_id IS NULL OR venue_id = $2)
       ORDER BY CASE WHEN venue_id IS NOT NULL AND category IS NOT NULL THEN 1 WHEN venue_id IS NOT NULL THEN 2 WHEN category IS NOT NULL THEN 3 ELSE 4 END, priority DESC LIMIT 1`,
      [parsed.category, venue.id]
    )
    const autoAssign = ruleResult.rows[0]?.assign_to || null

    // SLA deadlines
    const slaResult = await query(`SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`, [parsed.priority])
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by, assigned_to, sla_response_due, sla_resolution_due)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9)
       RETURNING id, ticket_number, title, category, priority, status`,
      [venue.id, parsed.title, parsed.description, parsed.category, parsed.priority, CLAW_STAFF_ID, autoAssign, slaResponseDue, slaResolutionDue]
    )

    // Notify venue's Slack channel
    const slackResult = await query(`SELECT slack_channel_id FROM venues WHERE id = $1`, [venue.id])
    const channelId = slackResult.rows[0]?.slack_channel_id
    if (channelId) {
      const msg = formatTicketNotification({
        ticket_number: result.rows[0].ticket_number,
        title: parsed.title,
        category: parsed.category,
        priority: parsed.priority,
        venue_name: venue.name,
        description: parsed.description,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    return NextResponse.json({
      ticket: result.rows[0],
      ai_parsed: true,
      parsed,
    })
  } catch (err) {
    console.error('Error creating AI ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
