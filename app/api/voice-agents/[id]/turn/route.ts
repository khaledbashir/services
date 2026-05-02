import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'
import { runChat, type StreamEvent } from '@/lib/ai/agent'
import { getVoiceAgent } from '@/lib/voice/agents'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const agent = await getVoiceAgent(params.id)
  if (!agent || !agent.isActive) {
    return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })
  }

  // Internal agents require a staff cookie. Public agents allow any caller —
  // the share/embed flow lives outside the dashboard. For now public still
  // routes through the staff auth so we don't expose CRUD tools to the
  // open internet by accident; opening up public-mode auth is a follow-up.
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const incomingChatId = typeof body.chat_id === 'string' ? body.chat_id : ''
  if (!message) return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 })

  let chatId = incomingChatId
  if (!chatId) {
    const created = await query(
      `INSERT INTO ai_chats (user_id, voice_agent_id, title) VALUES ($1, $2, $3) RETURNING id`,
      [auth.userId, agent.id, `${agent.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`]
    )
    chatId = created.rows[0].id
  } else {
    const owned = await query(
      `SELECT id FROM ai_chats WHERE id = $1 AND user_id = $2`,
      [chatId, auth.userId]
    )
    if (owned.rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'chat_not_found' }, { status: 404 })
    }
  }

  const textChunks: string[] = []
  const toolActions: Array<{ name: string; args: string; result: string }> = []
  let runError: string | null = null

  const emit = (ev: StreamEvent) => {
    if (ev.type === 'text' && typeof ev.data === 'string') {
      textChunks.push(ev.data)
    } else if (ev.type === 'tool_call') {
      const data = ev.data as { name?: string; args?: string }
      toolActions.push({ name: data.name || '', args: String(data.args || ''), result: '' })
    } else if (ev.type === 'tool_result') {
      const data = ev.data as { name?: string; result?: string }
      const last = toolActions[toolActions.length - 1]
      if (last && last.name === data.name) last.result = String(data.result || '').slice(0, 600)
    } else if (ev.type === 'error') {
      runError = String(ev.data)
    }
  }

  try {
    await runChat({
      chatId,
      userId: auth.userId,
      userRole: auth.role,
      userName: auth.fullName,
      userMessage: message,
      preferredProvider: agent.llmProvider || undefined,
      channel: 'voice',
      agentOverrides: {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        kbText: agent.kbText,
        greeting: agent.greeting,
      },
      emit,
    })
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
  }

  const spoken = textChunks.length > 0
    ? textChunks[textChunks.length - 1].trim()
    : runError
      ? `Something went wrong: ${runError}.`
      : 'Done.'

  return NextResponse.json({
    ok: !runError,
    chatId,
    text: spoken,
    toolActions,
    error: runError,
  })
}
