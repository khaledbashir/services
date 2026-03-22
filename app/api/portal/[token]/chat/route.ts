import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ANYTHINGLLM_URL = 'https://ancservices-anything-llm.izcgmb.easypanel.host/api/v1'
const ANYTHINGLLM_KEY = 'XGDBZ5Q-90R4117-NZJG7WZ-ZK693NP'

function venueNameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '-dot-')
    .replace(/!/g, '-bang-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { message } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Verify token and get venue
    const venueResult = await query(
      `SELECT id, name FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal token' }, { status: 404 })
    }

    const venue = venueResult.rows[0]
    const workspaceSlug = venueNameToSlug(venue.name)

    // Chat with the venue's AnythingLLM workspace
    const res = await fetch(`${ANYTHINGLLM_URL}/workspace/${workspaceSlug}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANYTHINGLLM_KEY}`,
      },
      body: JSON.stringify({ message, mode: 'query' }),
    })

    if (!res.ok) {
      // Fallback: try without workspace-specific slug
      const fallbackRes = await fetch(`${ANYTHINGLLM_URL}/workspace/anc-client-portal/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANYTHINGLLM_KEY}`,
        },
        body: JSON.stringify({ message, mode: 'query' }),
      })

      if (!fallbackRes.ok) {
        return NextResponse.json({
          response: "I'm having trouble connecting right now. Please try again in a moment.",
        })
      }

      const fallbackData = await fallbackRes.json()
      let content = fallbackData.textResponse || fallbackData.text || ''
      // Strip <think> tags
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      return NextResponse.json({ response: content, sources: fallbackData.sources || [] })
    }

    const data = await res.json()
    let content = data.textResponse || data.text || ''
    // Strip <think> tags from MiniMax responses
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    return NextResponse.json({
      response: content,
      sources: data.sources || [],
    })
  } catch (err) {
    console.error('Portal chat error:', err)
    return NextResponse.json({
      response: "I'm having trouble connecting right now. Please try again in a moment.",
    })
  }
}
