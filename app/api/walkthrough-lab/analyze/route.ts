export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { loadProviders } from '@/lib/ai/agent'
import { isAuthError, requireRole } from '@/lib/rbac'

type FileSummary = {
  name: string
  type: string
  size: number
  kind: 'video' | 'audio' | 'image' | 'text' | 'document' | 'other'
  extractedText?: string
  transcriptStatus?: 'transcribed' | 'skipped' | 'failed'
  transcriptNote?: string
}

type WalkthroughAnalysis = {
  title: string
  status: 'ready' | 'needs_transcript' | 'partial'
  plainSummary: string
  audience: string
  detectedPlatforms: string[]
  featureInventory: Array<{ feature: string; whatItShows: string; confidence: 'high' | 'medium' | 'low' }>
  recommendedChapters: Array<{ title: string; whatToSay: string; length: '30s' | '1min' | '2min' }>
  visualReview: string[]
  transcriptNotes: string[]
  kbCandidates: Array<{ title: string; whyItMatters: string }>
  followUps: string[]
}

const TEXT_FILE_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/vtt',
  'application/json',
  'application/x-subrip',
])

function kindFor(type: string, name: string): FileSummary['kind'] {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('text/') || TEXT_FILE_TYPES.has(type) || ['txt', 'md', 'vtt', 'srt', 'json'].includes(ext)) return 'text'
  if (['pdf', 'doc', 'docx'].includes(ext)) return 'document'
  return 'other'
}

function cleanText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function splitLines(text: string) {
  return cleanText(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function unique(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}

function mediaCanBeTranscribed(file: FileSummary) {
  if (file.kind === 'audio') return true
  if (file.kind !== 'video') return false
  const ext = file.name.toLowerCase().split('.').pop() || ''
  return ['mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'mp3'].includes(ext)
}

function transcriptionConfig() {
  const openAiKey = process.env.OPENAI_API_KEY || ''
  if (openAiKey) {
    return {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: openAiKey,
      model: process.env.WALKTHROUGH_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
    }
  }

  const provider = loadProviders().find((candidate) => /openai/i.test(`${candidate.name} ${candidate.baseUrl}`))
  if (!provider) return null
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: process.env.WALKTHROUGH_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
  }
}

async function transcribeMedia(file: File): Promise<{ text: string; note?: string }> {
  const config = transcriptionConfig()
  if (!config) return { text: '', note: 'No transcription provider is configured on the server.' }
  if (file.size > 26_000_000) {
    return { text: '', note: 'File is larger than the current transcription limit. Export captions or upload a shorter clip.' }
  }

  const form = new FormData()
  form.set('model', config.model)
  form.set('file', file, file.name)
  form.set('response_format', 'json')

  const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(110000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { text: '', note: `Transcription failed (${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}` }
  }

  const data = await res.json().catch(() => null)
  const text = typeof data?.text === 'string' ? cleanText(data.text) : ''
  return { text, note: text ? undefined : 'Transcription completed but returned no readable text.' }
}

function detectPlatforms(text: string) {
  const haystack = text.toLowerCase()
  const matches: string[] = []
  const checks: Array<[string, RegExp]> = [
    ['CRM', /\bcrm|account|opportunit|pipeline|forecast|company|contact|deal\b/i],
    ['Proposal Engine', /\bproposal|estimate|estimator|rfp|excel|mirror|spec|quote\b/i],
    ['Service Dashboard', /\bservice dashboard|ticket|event|venue|technician|workflow|customer portal|display health\b/i],
    ['Customer Portal', /\bcustomer portal|client portal|request|documents|approvals|diagnosis\b/i],
    ['Marketing Hub', /\bmarketing|newsletter|campaign|audience|social\b/i],
    ['Venue Vision', /\bvenue vision|3d|model|digital twin\b/i],
  ]
  for (const [label, pattern] of checks) {
    if (pattern.test(haystack)) matches.push(label)
  }
  return matches.length ? matches : ['General ANC platform walkthrough']
}

function fallbackAnalysis(input: {
  title: string
  transcript: string
  notes: string
  files: FileSummary[]
}): WalkthroughAnalysis {
  const text = cleanText([input.title, input.notes, input.transcript, ...input.files.map((file) => file.extractedText || '')].join('\n\n'))
  const lines = splitLines(text)
  const platforms = detectPlatforms(text)
  const mediaFiles = input.files.filter((file) => file.kind === 'video' || file.kind === 'audio')
  const hasTranscript = input.transcript.trim().length > 40 || input.files.some((file) => file.extractedText && file.extractedText.length > 40)
  const imageCount = input.files.filter((file) => file.kind === 'image').length

  const featureHints = unique(
    lines
      .filter((line) => /\b(show|open|click|create|upload|export|review|record|dashboard|portal|ticket|proposal|crm|account|event|venue|request)\b/i.test(line))
      .slice(0, 8)
  )

  const featureInventory = (featureHints.length ? featureHints : platforms).slice(0, 8).map((hint, index) => ({
    feature: index === 0 && input.title.trim() ? input.title.trim() : hint.slice(0, 80),
    whatItShows: hint.length > 90 ? `${hint.slice(0, 87)}...` : `Walkthrough segment covering ${hint.toLowerCase()}.`,
    confidence: hasTranscript ? 'medium' as const : 'low' as const,
  }))

  return {
    title: input.title.trim() || 'Walkthrough analysis',
    status: hasTranscript ? 'partial' : mediaFiles.length ? 'needs_transcript' : 'partial',
    plainSummary: hasTranscript
      ? `This walkthrough appears to cover ${platforms.join(', ')}. The transcript gives enough signal to draft chapters, but a human should still review the final clip boundaries.`
      : 'The upload was received, but no readable transcript was found. Add a transcript, captions file, or text notes to unlock stronger chaptering and KB extraction.',
    audience: /client|customer|portal/i.test(text) ? 'Client-facing training viewers' : 'ANC internal training viewers',
    detectedPlatforms: platforms,
    featureInventory,
    recommendedChapters: [
      {
        title: 'Start with the outcome',
        whatToSay: 'Show what the viewer can do by the end before walking through clicks.',
        length: '30s',
      },
      {
        title: 'Show the main path',
        whatToSay: hasTranscript ? 'Follow the clearest action sequence from the transcript.' : 'Replay the core workflow once a transcript is added.',
        length: '2min',
      },
      {
        title: 'Close with handoff or next step',
        whatToSay: 'End on what record, request, report, or shared link the viewer should use next.',
        length: '30s',
      },
    ],
    visualReview: [
      imageCount ? `${imageCount} screenshot/image file${imageCount === 1 ? '' : 's'} attached for visual review.` : 'No screenshots attached yet.',
      mediaFiles.length ? 'Media file present; add transcript/captions for semantic analysis.' : 'No video/audio walkthrough file attached.',
      'Check that the recording starts on the actual tool, not on setup or browser navigation.',
    ],
    transcriptNotes: hasTranscript
      ? lines.slice(0, 6)
      : ['Missing transcript. Export captions, paste Otter text, or attach a .txt/.vtt/.srt file.'],
    kbCandidates: platforms.slice(0, 4).map((platform) => ({
      title: `${platform} walkthrough`,
      whyItMatters: `Useful as a short training asset for viewers learning ${platform}.`,
    })),
    followUps: [
      ...(hasTranscript ? [] : ['Add transcript or captions for better chapter detection.']),
      ...(mediaFiles.length ? ['Run visual pass on the recording to mark dead air, blurry frames, and wrong-tab moments.'] : ['Attach the walkthrough video when ready.']),
      'Confirm whether this is internal training or client-facing training before publishing.',
    ],
  }
}

function analysisPrompt(input: {
  title: string
  platform: string
  intendedAudience: string
  transcript: string
  notes: string
  files: FileSummary[]
}) {
  return `You are building ANC's internal video knowledge base. Analyze this uploaded walkthrough like the Service Dashboard AI Diagnosis feature, but for training content.

Return ONLY raw JSON matching this TypeScript shape:
{
  "title": string,
  "status": "ready" | "needs_transcript" | "partial",
  "plainSummary": string,
  "audience": string,
  "detectedPlatforms": string[],
  "featureInventory": [{"feature": string, "whatItShows": string, "confidence": "high" | "medium" | "low"}],
  "recommendedChapters": [{"title": string, "whatToSay": string, "length": "30s" | "1min" | "2min"}],
  "visualReview": string[],
  "transcriptNotes": string[],
  "kbCandidates": [{"title": string, "whyItMatters": string}],
  "followUps": string[]
}

Rules:
- Plain language, no implementation jargon.
- Do not invent features not supported by the transcript/notes/files.
- If there is no transcript, status must be "needs_transcript".
- If video/audio is attached but transcript is missing, say what can be inferred from filename/notes only.
- Feature inventory must be specific enough for a training video planner.
- Recording chapters should start with highest viewer value, not file order.

TITLE:
${input.title || '(none)'}

SELECTED PLATFORM:
${input.platform || '(not selected)'}

INTENDED AUDIENCE:
${input.intendedAudience || '(not selected)'}

FILES:
${input.files.map((file) => `- ${file.name} (${file.kind}, ${file.type || 'unknown'}, ${file.size} bytes)`).join('\n') || '(none)'}

NOTES:
${input.notes || '(none)'}

TRANSCRIPT / TEXT:
${input.transcript || '(none)'}`
}

function extractJson(text: string): WalkthroughAnalysis | null {
  const raw = text.trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || raw
  try {
    return JSON.parse(candidate) as WalkthroughAnalysis
  } catch {
    return null
  }
}

async function runAi(prompt: string): Promise<WalkthroughAnalysis | null> {
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You return strict JSON for ANC training workflow analysis.' },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!res.ok) return null
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  return typeof content === 'string' ? extractJson(content) : null
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const form = await request.formData()
    const title = String(form.get('title') || '')
    const platform = String(form.get('platform') || '')
    const intendedAudience = String(form.get('audience') || '')
    const notes = cleanText(String(form.get('notes') || ''))
    const pastedTranscript = cleanText(String(form.get('transcript') || ''))
    const files = form.getAll('files').filter((item): item is File => item instanceof File)

    const summaries: FileSummary[] = []
    const extracted: string[] = []
    const transcribed: string[] = []

    for (const file of files.slice(0, 8)) {
      const type = file.type || 'application/octet-stream'
      const kind = kindFor(type, file.name)
      const summary: FileSummary = { name: file.name, type, size: file.size, kind }

      if (kind === 'text' && file.size <= 2_000_000) {
        const text = cleanText(await file.text())
        summary.extractedText = text.slice(0, 40_000)
        extracted.push(summary.extractedText)
      }

      if ((kind === 'video' || kind === 'audio') && mediaCanBeTranscribed(summary)) {
        const result = await transcribeMedia(file).catch((err) => ({
          text: '',
          note: err instanceof Error ? err.message : 'Transcription failed.',
        }))
        if (result.text) {
          summary.transcriptStatus = 'transcribed'
          summary.extractedText = result.text.slice(0, 40_000)
          transcribed.push(summary.extractedText)
        } else {
          summary.transcriptStatus = result.note?.startsWith('No transcription provider') ? 'skipped' : 'failed'
          summary.transcriptNote = result.note || 'Unable to transcribe this media file.'
        }
      } else if (kind === 'video' || kind === 'audio') {
        summary.transcriptStatus = 'skipped'
        summary.transcriptNote = 'This media type is not supported by the current transcription provider.'
      }

      summaries.push(summary)
    }

    const transcript = cleanText([pastedTranscript, ...extracted, ...transcribed].join('\n\n')).slice(0, 80_000)
    const fallback = fallbackAnalysis({ title, transcript, notes, files: summaries })
    const ai = await runAi(analysisPrompt({ title, platform, intendedAudience, transcript, notes, files: summaries })).catch((err) => {
      console.warn('[walkthrough-lab] AI analysis failed:', err)
      return null
    })

    const analysis = ai || fallback
    return NextResponse.json({
      ok: true,
      source: ai ? 'ai' : 'fallback',
      files: summaries,
      transcript,
      transcriptSource: pastedTranscript ? 'pasted' : transcribed.length ? 'transcribed_media' : extracted.length ? 'uploaded_text' : 'missing',
      analysis,
    })
  } catch (error) {
    console.error('[walkthrough-lab] analyze failed:', error)
    return NextResponse.json({ error: 'Walkthrough analysis failed' }, { status: 500 })
  }
}
