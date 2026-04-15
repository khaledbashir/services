import { NextRequest } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'
import { runChat, type StreamEvent } from '@/lib/ai/agent'

// Streams the agent's turn as Server-Sent Events:
//   event: text          data: {content: "..."}    (final assistant text)
//   event: tool_call     data: {id, name, args}
//   event: tool_result   data: {id, name, result}
//   event: done          data: null
//   event: error         data: "message"

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  let chatId = typeof body.chat_id === 'string' ? body.chat_id : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const preferredProvider = typeof body.provider === 'string' ? body.provider : undefined
  if (!message) return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })

  if (!chatId) {
    const created = await query(
      `INSERT INTO ai_chats (user_id, title) VALUES ($1, 'New chat') RETURNING id`,
      [auth.userId]
    )
    chatId = created.rows[0].id
  } else {
    const owned = await query(
      `SELECT id FROM ai_chats WHERE id = $1 AND user_id = $2`,
      [chatId, auth.userId]
    )
    if (owned.rows.length === 0) return new Response(JSON.stringify({ error: 'chat not found' }), { status: 404 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      }
      emit({ type: 'text', data: '' })  // flush initial byte so the client sees the stream
      // Announce the chat id so the UI can anchor new chats.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat', data: { id: chatId } })}\n\n`))
      try {
        await runChat({
          chatId,
          userId: auth.userId,
          userRole: auth.role,
          userName: auth.fullName,
          userMessage: message,
          preferredProvider,
          emit,
        })
      } catch (err) {
        emit({ type: 'error', data: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
