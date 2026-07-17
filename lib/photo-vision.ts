// AI enrichment for swept technician photos (Slack → Sales library → gallery).
// Same Gemini vision stack as /api/kb/diagnose, generalized: swept photos are
// not all LED issues — installs, racks, crowds, signage, venue shots all flow
// through the weekly sweep. Fail-soft by design: enrichment must never block
// a photo from being filed.

import { getGeminiApiKeys } from './gemini-key-pool'

const MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash-001']

export type PhotoAnalysis = {
  title: string
  category: string
  description: string
  tags: string[]
}

export const PHOTO_CATEGORIES = [
  'LED Issue',
  'Install / Construction',
  'Rack / Control Room',
  'Cabling / Signal',
  'Display Content',
  'Venue / Event',
  'Equipment',
  'Document / Screenshot',
  'Other',
] as const

const PROMPT = (context?: string) => `You are cataloguing field photos posted by technicians at ANC Sports, a company that installs and services large LED display systems in sports venues.

Analyze this photo and return:
1. "title" — short specific title, max 10 words
2. "category" — exactly one of: ${PHOTO_CATEGORIES.join(', ')}
3. "description" — 1-2 sentences on what the photo shows (equipment, location, condition). Be specific.
4. "tags" — 3-8 lowercase keywords (equipment names, venue features, issue words)

${context ? `Context: ${context}` : ''}

CRITICAL: Respond with ONLY raw JSON, no markdown, no code fences:
{"title":"...","category":"...","description":"...","tags":["..."]}`

function parseAnalysis(text: string): PhotoAnalysis | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (!parsed.title || !parsed.category) return null
    return {
      title: String(parsed.title).slice(0, 120),
      category: String(parsed.category).slice(0, 40),
      description: String(parsed.description || '').slice(0, 500),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 8).map((t: unknown) => String(t).toLowerCase().slice(0, 40))
        : [],
    }
  } catch {
    return null
  }
}

async function analyzeWithGemini(
  base64Data: string,
  mimeType: string,
  context?: string,
): Promise<PhotoAnalysis | null> {
  const keys = getGeminiApiKeys()
  if (!keys.length) return null

  for (const model of MODELS) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: PROMPT(context) },
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                  ],
                },
              ],
              generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
            }),
          },
        )
        if (!res.ok) continue
        const data = await res.json()
        const analysis = parseAnalysis(data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
        if (analysis) return analysis
      } catch {
        // try the next key/model combination
      }
    }
  }
  return null
}

async function analyzeWithOpenAI(
  base64Data: string,
  mimeType: string,
  context?: string,
): Promise<PhotoAnalysis | null> {
  const key = process.env.OPENAI_API_KEY || ''
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini',
        // newer OpenAI models reject `max_tokens` and non-default temperature
        max_completion_tokens: 800,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT(context) },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return parseAnalysis(data?.choices?.[0]?.message?.content || '')
  } catch {
    return null
  }
}

export async function analyzeTechPhoto(
  base64Data: string,
  mimeType: string,
  context?: string,
): Promise<PhotoAnalysis | null> {
  // Provider chain — Gemini's prepaid credits ran dry 2026-07-17 and silently
  // disabled every vision feature riding on it. Never single-provider again.
  return (
    (await analyzeWithGemini(base64Data, mimeType, context)) ||
    (await analyzeWithOpenAI(base64Data, mimeType, context))
  )
}
