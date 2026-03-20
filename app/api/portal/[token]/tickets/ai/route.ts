import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

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

    // Use Claude to parse the issue
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You are a support ticket parser for ANC Sports venue services. Given a client's issue description, extract:
- title: a clear, concise ticket title (max 80 chars)
- category: one of: hardware, software, content, operational, general
- priority: one of: low, medium, high, critical
- description: a clean, professional version of their description

Respond ONLY with valid JSON, no other text:
{"title":"...","category":"...","priority":"...","description":"..."}`,
        messages: [
          { role: 'user', content: `Venue: ${venue.name}\n\nClient says: "${message}"` }
        ],
      }),
    })

    if (!aiResponse.ok) {
      // Fallback: create ticket without AI parsing
      const result = await query(
        `INSERT INTO tickets (venue_id, title, description, category, priority, status)
         VALUES ($1, $2, $3, 'general', 'medium', 'open')
         RETURNING id, ticket_number, title, category, priority, status`,
        [venue.id, message.substring(0, 80), message]
      )
      return NextResponse.json({ ticket: result.rows[0], ai_parsed: false })
    }

    const aiData = await aiResponse.json()
    const aiText = aiData.content?.[0]?.text || ''

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

    // Create the ticket
    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING id, ticket_number, title, category, priority, status`,
      [venue.id, parsed.title, parsed.description, parsed.category, parsed.priority]
    )

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
