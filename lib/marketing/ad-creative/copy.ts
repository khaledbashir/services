import { loadProviders, type ProviderConfig } from '@/lib/ai/agent'
import { ANC_BRAND_VOICE } from '@/lib/signal/voice'

export type AdCopyLimits = {
  eyebrow: number
  headline: number
  body: number
  cta: number
}

/** SBJ headline-placement limits double as sensible defaults everywhere. */
export const DEFAULT_COPY_LIMITS: AdCopyLimits = { eyebrow: 30, headline: 95, body: 255, cta: 25 }

export type GeneratedAdCopy = {
  eyebrow: string
  headline: string
  body: string
  cta: string
  tagline: string
}

type ChatMessage = { role: 'system' | 'user'; content: string }

function providerRequestBody(provider: ProviderConfig, messages: ChatMessage[]) {
  const isMercury = provider.name === 'inception-mercury' || provider.model.toLowerCase().includes('mercury')
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.7,
    max_tokens: 1200,
  }
  if (isMercury) {
    body.reasoning_effort = process.env.MERCURY_REASONING_EFFORT || 'medium'
    body.realtime = true
  }
  return body
}

async function callModel(userPrompt: string): Promise<string> {
  const providers = loadProviders()
  const messages: ChatMessage[] = [
    { role: 'system', content: ANC_BRAND_VOICE },
    { role: 'user', content: userPrompt },
  ]
  let lastError = ''
  for (const provider of providers) {
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify(providerRequestBody(provider, messages)),
        signal: AbortSignal.timeout(60000),
      })
      const body = await res.text()
      if (!res.ok) {
        lastError = `${provider.name} ${res.status}: ${body.slice(0, 160)}`
        continue
      }
      const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }
      const text = data.choices?.[0]?.message?.content?.trim()
      if (text) return text
      lastError = `${provider.name}: empty response`
    } catch (err) {
      lastError = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  throw new Error(lastError || 'No AI providers responded')
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1]?.trim() || text.trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON')
  return JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>
}

function clampField(value: unknown, limit: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

export async function generateAdCopy(input: {
  brief: string
  venue?: string
  limits?: Partial<AdCopyLimits>
}): Promise<GeneratedAdCopy> {
  const limits: AdCopyLimits = { ...DEFAULT_COPY_LIMITS, ...input.limits }
  const prompt = `Write display-ad copy for ANC, the venue technology company (LED display systems, control, and content for major sports venues — but say "technology", never "screens" or "LED" in the copy).

Brief: ${input.brief}
${input.venue ? `Featured venue in the creative: ${input.venue}` : ''}

Hard character limits (spaces count — these are publisher-enforced):
- eyebrow: max ${limits.eyebrow} chars (short label, e.g. "Venue Technology Partner")
- headline: max ${limits.headline} chars. You may wrap ONE short phrase in **double asterisks** to highlight it.
- body: max ${limits.body} chars (1-2 sentences: who ANC is + what's offered; accurate claims only, no superlatives you can't prove)
- cta: max ${limits.cta} chars (2-3 words, e.g. "Learn More", "See What's Possible")
- tagline: max 30 chars (short mark for image footers, e.g. "Game day, delivered")

Return ONLY JSON: {"eyebrow":"...","headline":"...","body":"...","cta":"...","tagline":"..."}`

  const raw = await callModel(prompt)
  const parsed = extractJson(raw)
  return {
    eyebrow: clampField(parsed.eyebrow, limits.eyebrow),
    headline: clampField(parsed.headline, limits.headline + 4), // ** markers don't count toward render length
    body: clampField(parsed.body, limits.body),
    cta: clampField(parsed.cta, limits.cta),
    tagline: clampField(parsed.tagline, 30),
  }
}
