export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { ANC_BRAND_VOICE, COMPOSE_PER_CHANNEL_PROMPTS, type ChannelKey } from '@/lib/signal/voice'

interface ComposeBody {
  brief: string
  channel: ChannelKey
  context?: string
  useMarketingContext?: boolean
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ComposeBody
  const brief = (body.brief || '').trim()
  const channel = (body.channel || 'linkedin') as ChannelKey
  if (!brief) {
    return new Response('Brief is required', { status: 400 })
  }
  const channelPrompt = COMPOSE_PER_CHANNEL_PROMPTS[channel] || COMPOSE_PER_CHANNEL_PROMPTS.linkedin

  let contextBlock = (body.context || '').trim()
  if (!contextBlock && body.useMarketingContext) {
    try {
      const { loadMarketingComposeContext } = await import('@/lib/marketing/compose-context')
      const ctx = await loadMarketingComposeContext()
      contextBlock = ctx.promptBlock
    } catch {
      // compose still works without live marketing context
    }
  }

  const contextSection = contextBlock ? `\n\nMarketing context:\n${contextBlock}` : ''

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: ANC_BRAND_VOICE,
    messages: [
      {
        role: 'user',
        content: `Brief from the operator:\n${brief}${contextSection}\n\nTask: ${channelPrompt}\n\nOutput only the final post copy — no preamble, no headings, no quote marks around it.`,
      },
    ],
    temperature: 0.6,
  })

  return result.toTextStreamResponse()
}
