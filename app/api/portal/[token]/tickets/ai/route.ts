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
            content: `You are a support ticket parser for ANC Sports, a company that installs and maintains LED displays at sports venues and arenas nationwide.

Given a client's issue description, extract:
- title: a clear, concise ticket title (max 80 chars)
- category: one of: hardware, software, content, operational, general
- priority: one of: low, medium, high, critical. Use critical if it sounds like a total outage, the display is completely dead, or there's a game happening/imminent. Use high if partial failure or significant impact. Use medium for degraded but functional. Use low for cosmetic or non-urgent.
- description: a clean, professional version of their description that captures the key technical details
- follow_up: 2-3 specific follow-up questions that would help the support team diagnose faster. Think like a field service engineer — what would Chris the tech support lead want to know? Examples: which specific display/zone, when it started, is it intermittent or constant, is there a game today, what was showing when it happened, any recent changes.

Respond ONLY with valid JSON, no other text:
{"title":"...","category":"...","priority":"...","description":"...","follow_up":["...","...","..."]}`
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
    let aiText = aiData.choices?.[0]?.message?.content || ''

    // Strip <think>...</think> tags (some models include reasoning)
    aiText = aiText.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    let parsed: { title: string; category: string; priority: string; description: string; follow_up?: string[] }
    try {
      // Try to extract JSON from the response (may have extra text around it)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText)
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
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by, assigned_to, sla_response_due, sla_resolution_due, original_message)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10)
       RETURNING id, ticket_number, title, category, priority, status`,
      [venue.id, parsed.title, parsed.description, parsed.category, parsed.priority, CLAW_STAFF_ID, autoAssign, slaResponseDue, slaResolutionDue, message]
    )

    // Notify venue's Slack channel (fallback to default channel)
    const slackResult = await query(`SELECT slack_channel_id FROM venues WHERE id = $1`, [venue.id])
    const channelId = slackResult.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
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

      // Add original message
      if (message !== parsed.description) {
        msg.blocks.push(
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `💬 *Client said:* _"${message.substring(0, 300)}"_` }] }
        )
      }

      // Add follow-up questions if AI generated them
      if (parsed.follow_up && parsed.follow_up.length > 0) {
        msg.blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `❓ *Follow-up needed:*\n${parsed.follow_up.map((q: string) => `• ${q}`).join('\n')}` }
        })
      }

      // Add venue context: next event at this venue
      const nextEventResult = await query(
        `SELECT e.summary, TO_CHAR(e.event_date, 'Mon DD') as event_date,
                TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
                (SELECT string_agg(s.full_name, ', ') FROM event_assignments ea JOIN staff s ON ea.staff_id = s.id WHERE ea.event_id = e.id) as assigned
         FROM events e WHERE e.venue_id = $1 AND e.event_date >= CURRENT_DATE
         ORDER BY e.start_time LIMIT 1`,
        [venue.id]
      )
      if (nextEventResult.rows.length > 0) {
        const ev = nextEventResult.rows[0]
        msg.blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `📅 *Next event:* ${ev.summary} — ${ev.event_date} at ${ev.start_time}${ev.assigned ? ` (Assigned: ${ev.assigned})` : ' ⚠️ _No staff assigned_'}` }]
        })
      }

      // Add SLA deadline
      if (slaResponseDue) {
        const deadline = new Date(slaResponseDue)
        const hoursLeft = Math.round((deadline.getTime() - Date.now()) / 3600000 * 10) / 10
        msg.blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `⏱️ *SLA Response due in ${hoursLeft}h* (${parsed.priority} priority)` }]
        })
      }

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
