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

CRITICAL: Respond with ONLY raw JSON, no markdown, no code blocks, no backticks, no explanation. Keep each field under 200 characters. Just the JSON object:
{"title":"...","issue_type":"...","description":"...","likely_cause":"...","suggested_fix":"...","urgency":"..."}`

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
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
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
          console.log(`[kb-diagnose] ${model} raw response (first 500):`, text.substring(0, 500))

          // Try to extract JSON from response — handle markdown code blocks, loose text, etc.
          let jsonStr = ''
          const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (codeBlock) {
            jsonStr = codeBlock[1].trim()
          } else {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) jsonStr = jsonMatch[0]
          }

          // Try to parse — if truncated, extract what we can
          function extractDiagnosis(str: string) {
            // Try direct parse first
            try { return JSON.parse(str) } catch {}
            // Try cleaning
            try { return JSON.parse(str.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')) } catch {}
            // Try closing truncated JSON
            let attempt = str
            const openBraces = (attempt.match(/{/g) || []).length
            const closeBraces = (attempt.match(/}/g) || []).length
            if (openBraces > closeBraces) {
              // Close any open string
              if ((attempt.match(/"/g) || []).length % 2 !== 0) attempt += '"'
              for (let i = 0; i < openBraces - closeBraces; i++) attempt += '}'
              try { return JSON.parse(attempt) } catch {}
            }
            // Extract individual fields with regex
            const title = str.match(/"title"\s*:\s*"([^"]*)"/)
            const issue = str.match(/"issue_type"\s*:\s*"([^"]*)"/)
            const desc = str.match(/"description"\s*:\s*"([^"]*)"/)
            const cause = str.match(/"likely_cause"\s*:\s*"([^"]*)"/)
            const fix = str.match(/"suggested_fix"\s*:\s*"([^"]*)"/)
            const urg = str.match(/"urgency"\s*:\s*"([^"]*)"/)
            if (title) {
              return {
                title: title[1],
                issue_type: issue?.[1] || 'Other',
                description: desc?.[1] || '',
                likely_cause: cause?.[1] || 'See description',
                suggested_fix: fix?.[1] || 'Refer to the diagnosis description',
                urgency: urg?.[1] || 'Medium',
              }
            }
            return null
          }

          const parsed = extractDiagnosis(jsonStr || text)
          if (parsed) {
            console.log(`[kb-diagnose] Success with ${model}: ${parsed.title}`)
            return NextResponse.json({ ok: true, diagnosis: parsed, model })
          }

          lastError = `Could not parse: ${(jsonStr || text).substring(0, 200)}`
          console.warn(`[kb-diagnose] ${model} parse failed, trying next...`)
        }

        lastError = await res.text()
        console.warn(`[kb-diagnose] ${model} returned ${res.status}, trying next...`)
      } catch (err: any) {
        lastError = err.message
        console.warn(`[kb-diagnose] ${model} failed: ${err.message}, trying next...`)
      }
    }

    // Gemini exhausted (all models). Fall back to OpenAI vision — Gemini's
    // prepaid credits ran dry 2026-07-17 and took this endpoint down entirely.
    const openaiKey = process.env.OPENAI_API_KEY || ''
    if (openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini',
            // newer OpenAI models reject `max_tokens` and non-default temperature
            max_completion_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: PROMPT(context) },
                { type: 'image_url', image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${raw}` } },
              ],
            }],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0])
              if (parsed.title) {
                console.log(`[kb-diagnose] Success with OpenAI fallback: ${parsed.title}`)
                return NextResponse.json({ ok: true, diagnosis: parsed, model: 'openai-fallback' })
              }
            } catch { /* fall through to error */ }
          }
          lastError = `OpenAI parse failed: ${text.substring(0, 150)}`
        } else {
          lastError = `OpenAI ${res.status}: ${(await res.text()).substring(0, 150)}`
        }
      } catch (err: any) {
        lastError = `OpenAI: ${err.message}`
      }
    }

    console.error(`[kb-diagnose] All models failed. Last error: ${lastError}`)
    return NextResponse.json({ error: `All AI models unavailable. Last: ${lastError.substring(0, 200)}` }, { status: 503 })
  } catch (err) {
    console.error('KB diagnose error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
