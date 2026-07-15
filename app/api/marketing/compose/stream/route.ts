export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { runComposeStream, type ComposeStreamEvent } from '@/lib/marketing/compose-stream'

async function userIdFromToken(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return (payload as { userId?: string }).userId || null
  } catch { return null }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const brief = String(body.brief || '').trim()
  const audienceId = body.audienceId ? String(body.audienceId) : null
  const userId = await userIdFromToken(request)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: ComposeStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await runComposeStream({ brief, audienceId, userId, write })
      } catch (err) {
        write({ type: 'error', message: err instanceof Error ? err.message : 'Stream failed' })
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
    },
  })
}
