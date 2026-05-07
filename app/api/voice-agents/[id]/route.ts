export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  deleteVoiceAgent,
  getVoiceAgent,
  updateVoiceAgent,
  type UpdateVoiceAgentInput,
} from '@/lib/voice/agents'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const agent = await getVoiceAgent(params.id)
  if (!agent) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, agent })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const existing = await getVoiceAgent(params.id)
  if (!existing) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const patch: UpdateVoiceAgentInput = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description
  if (typeof body.systemPrompt === 'string' || body.systemPrompt === null) patch.systemPrompt = body.systemPrompt
  if (typeof body.kbText === 'string' || body.kbText === null) patch.kbText = body.kbText
  if (typeof body.ttsProvider === 'string') patch.ttsProvider = body.ttsProvider
  if (typeof body.ttsVoice === 'string') patch.ttsVoice = body.ttsVoice
  if (typeof body.ttsModel === 'string' || body.ttsModel === null) patch.ttsModel = body.ttsModel
  if (typeof body.llmProvider === 'string' || body.llmProvider === null) patch.llmProvider = body.llmProvider
  if (typeof body.llmModel === 'string' || body.llmModel === null) patch.llmModel = body.llmModel
  if (Array.isArray(body.allowedTools) || body.allowedTools === null) {
    patch.allowedTools = Array.isArray(body.allowedTools)
      ? body.allowedTools.filter((s: unknown) => typeof s === 'string')
      : null
  }
  if (body.visibility === 'public' || body.visibility === 'internal') patch.visibility = body.visibility
  if (Array.isArray(body.embedOrigins) || body.embedOrigins === null) {
    patch.embedOrigins = Array.isArray(body.embedOrigins)
      ? body.embedOrigins.filter((s: unknown) => typeof s === 'string')
      : null
  }
  if (typeof body.greeting === 'string' || body.greeting === null) patch.greeting = body.greeting
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive

  const updated = await updateVoiceAgent(existing.id, patch)
  return NextResponse.json({ ok: true, agent: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const existing = await getVoiceAgent(params.id)
  if (!existing) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })

  const ok = await deleteVoiceAgent(existing.id)
  return NextResponse.json({ ok })
}
