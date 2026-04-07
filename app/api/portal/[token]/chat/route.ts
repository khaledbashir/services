import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ANYTHINGLLM_URL = 'https://ancservices-anything-llm.izcgmb.easypanel.host/api/v1'
const ANYTHINGLLM_KEY = 'XGDBZ5Q-90R4117-NZJG7WZ-ZK693NP'
const CHAT_TIMEOUT_MS = 12000

function venueNameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '-dot-')
    .replace(/!/g, '-bang-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cleanAssistantText(value: string | null | undefined): string {
  return (value || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function buildFallbackResponse(message: string, venueName: string): string {
  const normalized = message.trim().toLowerCase()
  const isGreeting = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'].includes(normalized)

  if (isGreeting) {
    return `Hi! I'm the ANC assistant for ${venueName}. The live knowledge workspace is still warming up, but I am online. Try asking about event support, displays, maintenance, or your venue operations and I'll respond as soon as the workspace is available.`
  }

  return `I'm having trouble reaching the live ANC knowledge workspace for ${venueName} right now. Please try again in a moment. If this keeps happening, ANC may need to finish configuring this venue's workspace in AnythingLLM.`
}

async function chatWorkspace(slug: string, message: string): Promise<{ ok: boolean; response: string; sources: any[]; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  try {
    const res = await fetch(`${ANYTHINGLLM_URL}/workspace/${slug}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANYTHINGLLM_KEY}`,
      },
      body: JSON.stringify({ message, mode: 'chat' }),
      signal: controller.signal,
    })

    const data = await res.json().catch(() => ({}))
    const content = cleanAssistantText(data.textResponse || data.text || '')

    if (!res.ok) {
      return {
        ok: false,
        response: content,
        sources: data.sources || [],
        error: data.error || `Workspace ${slug} returned ${res.status}`,
      }
    }

    if (!content) {
      return {
        ok: false,
        response: '',
        sources: data.sources || [],
        error: `Workspace ${slug} returned an empty response`,
      }
    }

    return { ok: true, response: content, sources: data.sources || [] }
  } catch (err) {
    return {
      ok: false,
      response: '',
      sources: [],
      error: err instanceof Error ? err.message : 'Unknown chat error',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { message } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const venueResult = await query(
      `SELECT id, name FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal token' }, { status: 404 })
    }

    const venue = venueResult.rows[0]
    const workspaceSlug = venueNameToSlug(venue.name)
    const workspaceCandidates = [workspaceSlug]

    for (const slug of workspaceCandidates) {
      const result = await chatWorkspace(slug, message.trim())
      if (result.ok) {
        return NextResponse.json({
          response: result.response,
          sources: result.sources,
          workspace: slug,
        })
      }

      console.warn(`Portal chat workspace failed for ${venue.name} (${slug}): ${result.error}`)
    }

    return NextResponse.json({
      response: buildFallbackResponse(message, venue.name),
      sources: [],
      workspace: null,
      fallback: true,
    })
  } catch (err) {
    console.error('Portal chat error:', err)
    return NextResponse.json({
      response: "I'm having trouble connecting right now. Please try again in a moment.",
      sources: [],
      fallback: true,
    })
  }
}
