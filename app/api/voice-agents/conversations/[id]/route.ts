export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'

interface ToolCall {
  id: string
  type?: string
  function?: { name?: string; arguments?: string }
}

// Single conversation transcript — used by the conversation detail page.
// Returns the full ordered message stream (user / assistant / tool) plus
// chat metadata, agent info, and derived aggregates (duration, status).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const seesAll = auth.role === 'admin' || auth.role === 'tech_support'

  const chatRes = await query(
    `SELECT
       c.id, c.title, c.created_at, c.updated_at, c.user_id,
       s.full_name AS user_name, s.email AS user_email,
       va.id AS agent_id, va.slug AS agent_slug, va.name AS agent_name,
       va.description AS agent_description, va.tts_provider, va.tts_voice,
       va.llm_provider, va.llm_model
     FROM ai_chats c
     INNER JOIN voice_agents va ON va.id = c.voice_agent_id
     LEFT JOIN staff s ON s.id = c.user_id
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [params.id]
  )
  if (chatRes.rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'conversation_not_found' }, { status: 404 })
  }
  const chat = chatRes.rows[0]

  if (!seesAll && chat.user_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const msgRes = await query(
    `SELECT id, role, content, tool_calls, tool_call_id, tool_name, created_at
     FROM ai_messages
     WHERE chat_id = $1::uuid
     ORDER BY created_at ASC`,
    [params.id]
  )

  const messages = msgRes.rows.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant' | 'tool' | 'system',
    content: m.content,
    toolCalls: Array.isArray(m.tool_calls)
      ? (m.tool_calls as ToolCall[]).map((c) => ({
          id: c.id,
          name: c.function?.name || '',
          arguments: c.function?.arguments || '',
        }))
      : null,
    toolCallId: m.tool_call_id,
    toolName: m.tool_name,
    createdAt: m.created_at,
  }))

  const userMsg = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const messageCount = userMsg.length
  const firstAt = messages[0]?.createdAt ? new Date(messages[0].createdAt).getTime() : null
  const lastAt = messages[messages.length - 1]?.createdAt
    ? new Date(messages[messages.length - 1].createdAt).getTime()
    : null
  const durationSeconds = firstAt && lastAt ? Math.round((lastAt - firstAt) / 1000) : 0

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const status =
    messageCount === 0
      ? 'empty'
      : lastAssistant?.content?.startsWith('⚠️')
        ? 'error'
        : 'successful'

  // Quick "summary" for the right-rail Overview card — first assistant
  // reply is usually the framing of the call. Cheap but useful.
  const firstAssistant = messages.find((m) => m.role === 'assistant')
  const summary = firstAssistant?.content?.slice(0, 400) || null

  return NextResponse.json({
    ok: true,
    conversation: {
      id: chat.id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      userId: chat.user_id,
      userName: chat.user_name,
      userEmail: chat.user_email,
      agent: {
        id: chat.agent_id,
        slug: chat.agent_slug,
        name: chat.agent_name,
        description: chat.agent_description,
        ttsProvider: chat.tts_provider,
        ttsVoice: chat.tts_voice,
        llmProvider: chat.llm_provider,
        llmModel: chat.llm_model,
      },
      messageCount,
      durationSeconds,
      status,
      summary,
      messages,
    },
  })
}
