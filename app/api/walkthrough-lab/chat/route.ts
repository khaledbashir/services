export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { loadProviders } from '@/lib/ai/agent'
import { isAuthError, requireRole } from '@/lib/rbac'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type WalkthroughAnalysisContext = {
  title?: string
  plainSummary?: string
  detectedPlatforms?: string[]
  featureInventory?: Array<{ feature?: string; whatItShows?: string; confidence?: string }>
  recommendedChapters?: Array<{ title?: string; whatToSay?: string; length?: string }>
  transcriptNotes?: string[]
  followUps?: string[]
}

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function analysisSummary(analysis: WalkthroughAnalysisContext | null) {
  if (!analysis) return '(no analysis yet)'
  return [
    `Title: ${analysis.title || '(untitled)'}`,
    `Summary: ${analysis.plainSummary || '(none)'}`,
    `Platforms: ${(analysis.detectedPlatforms || []).join(', ') || '(none)'}`,
    'Features:',
    ...(analysis.featureInventory || []).slice(0, 12).map((item) => `- ${item.feature || 'Feature'}: ${item.whatItShows || ''} (${item.confidence || 'unknown'})`),
    'Recommended chapters:',
    ...(analysis.recommendedChapters || []).slice(0, 12).map((item, index) => `${index + 1}. ${item.title || 'Chapter'} — ${item.whatToSay || ''} (${item.length || 'short'})`),
    'Open follow-ups:',
    ...(analysis.followUps || []).slice(0, 8).map((item) => `- ${item}`),
  ].join('\n')
}

function fallbackAnswer(question: string, transcript: string, analysis: WalkthroughAnalysisContext | null) {
  const q = question.toLowerCase()
  const chapters = analysis?.recommendedChapters || []
  if (/record|start|first|order|sequence/.test(q) && chapters.length) {
    return `Start with "${chapters[0].title}". ${chapters[0].whatToSay || ''} Keep the first clip tight, then move through the rest of the recommended chapter list.`
  }
  if (/transcript|said|mention/.test(q) && transcript) {
    return `The transcript is loaded. I can use it for planning, but the AI model is not available right now, so here is the strongest signal I can see: ${transcript.slice(0, 700)}${transcript.length > 700 ? '...' : ''}`
  }
  if (analysis?.plainSummary) return analysis.plainSummary
  return 'The walkthrough is loaded, but the chat model is not configured right now. Add a transcript or retry after the AI provider is available.'
}

async function runChat(input: {
  question: string
  transcript: string
  notes: string
  analysis: WalkthroughAnalysisContext | null
  history: ChatMessage[]
}) {
  const providers = loadProviders()
  if (providers.length === 0) return null
  const provider = providers[0]
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are ANC Walkthrough Lab chat. Answer only from the supplied walkthrough transcript, notes, and analysis. Be direct, practical, and training-focused. If the evidence is missing, say what is missing and what to capture next.',
        },
        {
          role: 'user',
          content: `WALKTHROUGH ANALYSIS\n${analysisSummary(input.analysis)}\n\nRECORDING NOTES\n${input.notes || '(none)'}\n\nTRANSCRIPT\n${input.transcript || '(none)'}`,
        },
        ...input.history.slice(-8).map((msg) => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: input.question },
      ],
    }),
    signal: AbortSignal.timeout(55000),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  return typeof content === 'string' ? cleanText(content) : null
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json().catch(() => ({}))
    const question = cleanText(body.question)
    const transcript = cleanText(body.transcript).slice(0, 80_000)
    const notes = cleanText(body.notes).slice(0, 12_000)
    const analysis = (body.analysis && typeof body.analysis === 'object' ? body.analysis : null) as WalkthroughAnalysisContext | null
    const history = Array.isArray(body.history) ? body.history.filter((msg: ChatMessage) => msg?.role && msg?.content).slice(-10) : []

    if (!question) return NextResponse.json({ error: 'Question is required' }, { status: 400 })

    const answer = await runChat({ question, transcript, notes, analysis, history }).catch((err) => {
      console.warn('[walkthrough-lab] chat failed:', err)
      return null
    })

    return NextResponse.json({
      ok: true,
      source: answer ? 'ai' : 'fallback',
      answer: answer || fallbackAnswer(question, transcript, analysis),
      suggestedQuestions: [
        'What should I record first?',
        'Make this client-safe.',
        'What is missing before this becomes a training article?',
      ],
    })
  } catch (error) {
    console.error('[walkthrough-lab] chat route failed:', error)
    return NextResponse.json({ error: 'Walkthrough chat failed' }, { status: 500 })
  }
}
