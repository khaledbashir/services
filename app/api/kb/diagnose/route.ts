import { NextRequest, NextResponse } from 'next/server'

const MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash-001']

const PROMPT = (context?: string) => `You are an LED display diagnostics expert for ANC Sports, a company that installs and maintains large LED displays in sports arenas and entertainment venues.

Analyze this photo of an LED display issue. Provide:

1. **Issue Title** — a short, specific title (max 10 words)
2. **Issue Type** — one of: Dead Pixels, Brightness Mismatch, Color Shift, Signal Loss, Config Loss, Cable Failure, Module Failure, Power Issue, Software Glitch, Scrambled Content, Other
3. **Description** — 2-3 sentences describing what you see in the image. Be specific about location, pattern, and severity.
4. **Likely Cause** — what's probably causing this based on common LED display issues
5. **Suggested Fix** — step-by-step instructions a field technician should follow
6. **Urgency** — Low (cosmetic), Medium (noticeable but functional), High (affecting event), Critical (display unusable)

${context ? `Additional context from the technician: ${context}` : ''}

Respond in this exact JSON format:
{
  "title": "...",
  "issue_type": "...",
  "description": "...",
  "likely_cause": "...",
  "suggested_fix": "...",
  "urgency": "..."
}`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image, context } = body

    if (!image?.data) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 })
    }

    const key = process.env.GEMINI_API_KEY || ''
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

    const raw = image.data.includes(',') ? image.data.split(',')[1] : image.data

    const payload = JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT(context) },
          { inline_data: { mime_type: image.mimeType || 'image/jpeg', data: raw } },
        ],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
    })

    // Try models in order — fallback if one is overloaded or unavailable
    let lastError = ''
    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }
        )

        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            return NextResponse.json({ error: 'AI response could not be parsed', raw: text }, { status: 500 })
          }
          const diagnosis = JSON.parse(jsonMatch[0])
          console.log(`[kb-diagnose] Success with ${model}: ${diagnosis.title}`)
          return NextResponse.json({ ok: true, diagnosis, model })
        }

        lastError = await res.text()
        console.warn(`[kb-diagnose] ${model} returned ${res.status}, trying next...`)
      } catch (err: any) {
        lastError = err.message
        console.warn(`[kb-diagnose] ${model} failed: ${err.message}, trying next...`)
      }
    }

    console.error(`[kb-diagnose] All models failed. Last error: ${lastError}`)
    return NextResponse.json({ error: `All AI models unavailable. Last: ${lastError.substring(0, 200)}` }, { status: 503 })
  } catch (err) {
    console.error('KB diagnose error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
