// ─────────────────────────────────────────────────────────────────
// image-provider.ts — one provider-agnostic entry point for every
// image generation in the dashboard.
//
// Why this exists: the AI First Draft endpoint called api.openai.com
// directly with a hardcoded model, and the AI skill kept its own
// second copy of that logic plus a Pollinations branch. When the
// OpenAI account's billing lapsed, generation returned
// `429 billing_not_active` and there was nowhere to fail over to —
// the whole feature was dead with no config-only way out.
//
// Providers are tried in order. The order comes from
// AI_IMAGE_PROVIDERS (comma-separated); otherwise it is every
// provider that has a key, in the DEFAULT_ORDER below. A provider
// with no key is skipped silently — it is not configured, which is
// not an error. A provider that has a key and fails is recorded, and
// the next one is tried; if they all fail the caller gets every
// reason at once instead of just the last.
// ─────────────────────────────────────────────────────────────────

export type ImageProviderName = 'gemini' | 'openai' | 'pollinations'

export interface GeneratedImage {
  bytes: Buffer
  /** Real MIME type of `bytes` — providers do NOT all return PNG. */
  contentType: string
  /** File extension matching contentType, without the dot. */
  extension: string
  provider: ImageProviderName
  model: string
}

export interface GenerateImageOptions {
  /** Overrides discovered keys — used by the AI skill, which accepts a key as a tool argument. */
  apiKeys?: Partial<Record<ImageProviderName, string>>
  /** Overrides the resolved provider order. */
  providers?: ImageProviderName[]
  timeoutMs?: number
}

const DEFAULT_ORDER: ImageProviderName[] = ['gemini', 'openai', 'pollinations']

const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5'
const POLLINATIONS_MODEL = process.env.POLLINATIONS_IMAGE_MODEL || 'flux'

const DEFAULT_TIMEOUT_MS = 180_000

/**
 * Legacy shape: a JSON array of provider objects in AI_PROVIDERS_JSON. It
 * carries the dashboard's *text* models, but an image key was historically
 * dropped in there too, so it stays a lookup source.
 */
function keyFromProvidersJson(name: string): string {
  try {
    const list = JSON.parse(process.env.AI_PROVIDERS_JSON || '[]')
    if (!Array.isArray(list)) return ''
    const hit = list.find((p: any) => p?.name === name && p?.apiKey)
    return hit?.apiKey || ''
  } catch {
    return ''
  }
}

export function resolveKey(provider: ImageProviderName, overrides?: GenerateImageOptions['apiKeys']): string {
  const override = overrides?.[provider]
  if (override) return override
  switch (provider) {
    case 'gemini':
      // Image generation is billed separately from text on Google, and the
      // dashboard's existing GEMINI_API_KEY is a free-tier key that answers
      // 429 for image models. A dedicated image key takes precedence so
      // enabling drafts never means re-pointing the text features too.
      return process.env.GEMINI_IMAGE_API_KEY
        || process.env.GEMINI_API_KEY
        || process.env.GOOGLE_API_KEY
        || keyFromProvidersJson('gemini')
        || ''
    case 'openai':
      return process.env.OPENAI_API_KEY || keyFromProvidersJson('openai') || ''
    case 'pollinations':
      return process.env.POLLINATIONS_API_KEY || ''
  }
}

export function resolveProviderOrder(options?: GenerateImageOptions): ImageProviderName[] {
  if (options?.providers?.length) return options.providers
  const configured = (process.env.AI_IMAGE_PROVIDERS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((s): s is ImageProviderName => DEFAULT_ORDER.includes(s as ImageProviderName))
  const order = configured.length ? configured : DEFAULT_ORDER
  return order.filter(p => !!resolveKey(p, options?.apiKeys))
}

/** True when at least one image provider has a usable key. */
export function isImageGenerationConfigured(options?: GenerateImageOptions): boolean {
  return resolveProviderOrder(options).length > 0
}

function extensionFor(contentType: string): string {
  const t = contentType.toLowerCase()
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('webp')) return 'webp'
  return 'png'
}

async function generateGemini(prompt: string, key: string, timeoutMs: number): Promise<GeneratedImage> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini image gen ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as any
  const parts = data?.candidates?.[0]?.content?.parts || []
  // The model can answer with prose instead of an image (a refusal, or a
  // safety block). Surface that as its own message — "empty response" sends
  // whoever reads the log hunting for a network fault that isn't there.
  const image = parts.find((p: any) => p?.inlineData?.data)
  if (!image) {
    const text = parts.map((p: any) => p?.text).filter(Boolean).join(' ').slice(0, 300)
    const reason = data?.candidates?.[0]?.finishReason
    throw new Error(`Gemini returned no image${reason ? ` (${reason})` : ''}${text ? `: ${text}` : ''}`)
  }
  const contentType = image.inlineData.mimeType || 'image/png'
  return {
    bytes: Buffer.from(image.inlineData.data, 'base64'),
    contentType,
    extension: extensionFor(contentType),
    provider: 'gemini',
    model: GEMINI_MODEL,
  }
}

async function generateOpenAI(prompt: string, key: string, timeoutMs: number): Promise<GeneratedImage> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, prompt, n: 1, size: '1024x1024', quality: 'low' }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI image gen ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = data.data?.[0]
  if (!item) throw new Error('OpenAI returned an empty image response')
  let bytes: Buffer
  let contentType = 'image/png'
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (item.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!img.ok) throw new Error(`OpenAI image download ${img.status}`)
    contentType = img.headers.get('content-type') || contentType
    bytes = Buffer.from(await img.arrayBuffer())
  } else {
    throw new Error('OpenAI returned no image data')
  }
  return { bytes, contentType, extension: extensionFor(contentType), provider: 'openai', model: OPENAI_MODEL }
}

async function generatePollinations(prompt: string, key: string, timeoutMs: number): Promise<GeneratedImage> {
  const baseUrl = (process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai').replace(/\/$/, '')
  const params = new URLSearchParams({
    model: POLLINATIONS_MODEL,
    width: '1024',
    height: '1024',
    enhance: 'true',
  })
  const res = await fetch(`${baseUrl}/image/${encodeURIComponent(prompt)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pollinations image gen ${res.status}: ${body.slice(0, 300)}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pollinations returned a non-image response: ${body.slice(0, 300)}`)
  }
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType,
    extension: extensionFor(contentType),
    provider: 'pollinations',
    model: POLLINATIONS_MODEL,
  }
}

const GENERATORS: Record<ImageProviderName, (prompt: string, key: string, timeoutMs: number) => Promise<GeneratedImage>> = {
  gemini: generateGemini,
  openai: generateOpenAI,
  pollinations: generatePollinations,
}

export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<GeneratedImage> {
  const order = resolveProviderOrder(options)
  if (order.length === 0) {
    throw new Error('No image generation provider is configured on this environment')
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const failures: string[] = []
  for (const provider of order) {
    const key = resolveKey(provider, options.apiKeys)
    try {
      return await GENERATORS[provider](prompt, key, timeoutMs)
    } catch (err: any) {
      failures.push(`${provider}: ${err?.message || 'unknown error'}`)
      console.error(`[image-provider] ${provider} failed:`, err?.message || err)
    }
  }
  throw new Error(`Image generation failed on every configured provider — ${failures.join(' | ')}`)
}
