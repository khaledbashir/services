export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'

// AnythingLLM embed proxy. Hides the upstream URL + embed UUID + agent
// prefix so the browser only sees `/api/consultant/chat`.
//
// The "ANC Executive Advisor" workspace is configured in AnythingLLM at
// https://ancservices-anything-llm.izcgmb.easypanel.host. Web search runs
// via Serper. We always prepend `@agent` so the model can use the
// web-browsing skill on every message (without the user needing to know).
// Defaults updated 2026-05-13: the previous abc-anything-llm host + embed UUID
// both 404'd on the live AnythingLLM instances. The Executive Advisor embed
// lives on ancservices-anything-llm with UUID a8a0aa84-... Override either
// via env vars on EasyPanel if a different workspace/embed is added later.
const UPSTREAM_BASE = process.env.ANYTHINGLLM_BASE_URL || 'https://ancservices-anything-llm.izcgmb.easypanel.host'
const EMBED_UUID = process.env.ANC_CONSULTANT_EMBED_UUID || 'a8a0aa84-a360-409c-ab5d-3ee7ac8afd26'

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({})) as {
    message?: string
    sessionId?: string
    useAgent?: boolean
  }

  const message = (body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const sessionId = body.sessionId || `${auth.userId}-${Date.now()}`
  // Auto-route through the agent so web search + tools are available.
  // The user doesn't need to type `@agent` themselves.
  const prefixed = body.useAgent === false ? message : `@agent ${message}`

  const upstreamUrl = `${UPSTREAM_BASE}/api/embed/${EMBED_UUID}/stream-chat`
  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: prefixed,
      sessionId,
    }),
    signal: AbortSignal.timeout(110_000),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    return NextResponse.json({ error: `Advisor upstream failed: ${upstream.status} ${text.slice(0, 300)}` }, { status: 502 })
  }

  // Pipe the SSE stream straight through. AnythingLLM emits server-sent
  // events that the client renders incrementally.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  // Health/probe
  return NextResponse.json({
    ok: true,
    workspace: 'anc-executive-advisor',
    embed: EMBED_UUID,
  })
}
