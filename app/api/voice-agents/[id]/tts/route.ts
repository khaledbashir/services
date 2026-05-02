import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getVoiceAgent } from '@/lib/voice/agents'
import { getTtsProvider, TtsError } from '@/lib/voice/tts'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const agent = await getVoiceAgent(params.id)
  if (!agent || !agent.isActive) {
    return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })
  }

  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text : ''

  // Per-agent TTS config wins; request body can override (preview / debug).
  const providerName = typeof body.provider === 'string' && body.provider ? body.provider : agent.ttsProvider
  const voice = typeof body.voice === 'string' && body.voice ? body.voice : agent.ttsVoice
  const model = typeof body.model === 'string' && body.model ? body.model : agent.ttsModel || undefined

  const provider = getTtsProvider(providerName)
  if (!provider.isConfigured()) {
    return NextResponse.json({ ok: false, error: `${provider.name}_not_configured` }, { status: 503 })
  }

  try {
    const result = await provider.synthesize({ text, voice, model })
    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
        'X-Tts-Provider': provider.name,
        'X-Tts-Format': result.format,
        'X-Voice-Agent': agent.slug,
      },
    })
  } catch (error) {
    if (error instanceof TtsError) {
      return NextResponse.json({ ok: false, error: error.message, detail: error.detail }, { status: error.status })
    }
    console.error('[voice-agent-tts] error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'tts_failed' },
      { status: 500 }
    )
  }
}
