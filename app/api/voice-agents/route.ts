import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { createVoiceAgent, listVoiceAgents } from '@/lib/voice/agents'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('include_inactive') === '1'
  const agents = await listVoiceAgents({ includeInactive })
  return NextResponse.json({ ok: true, agents })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

  try {
    const agent = await createVoiceAgent({
      name,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
      kbText: typeof body.kbText === 'string' ? body.kbText : undefined,
      ttsProvider: typeof body.ttsProvider === 'string' ? body.ttsProvider : undefined,
      ttsVoice: typeof body.ttsVoice === 'string' ? body.ttsVoice : undefined,
      ttsModel: typeof body.ttsModel === 'string' ? body.ttsModel : undefined,
      llmProvider: typeof body.llmProvider === 'string' ? body.llmProvider : undefined,
      allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools.filter((s: unknown) => typeof s === 'string') : undefined,
      visibility: body.visibility === 'public' ? 'public' : 'internal',
      embedOrigins: Array.isArray(body.embedOrigins) ? body.embedOrigins.filter((s: unknown) => typeof s === 'string') : undefined,
      greeting: typeof body.greeting === 'string' ? body.greeting : undefined,
      createdBy: auth.userId,
    })
    return NextResponse.json({ ok: true, agent }, { status: 201 })
  } catch (error) {
    console.error('voice-agents POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
