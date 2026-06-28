'use client'

import { FormEvent, useMemo, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { FileAudio, FileImage, FileText, FileVideo, Loader2, MessageSquare, Send, UploadCloud } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'

type Analysis = {
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

type FileSummary = {
  name: string
  type: string
  size: number
  kind: 'video' | 'audio' | 'image' | 'text' | 'document' | 'other'
  extractedText?: string
  transcriptStatus?: 'transcribed' | 'skipped' | 'failed'
  transcriptNote?: string
}

type Result = {
  source: 'ai' | 'fallback'
  files: FileSummary[]
  transcript: string
  transcriptSource: 'pasted' | 'transcribed_media' | 'uploaded_text' | 'missing'
  analysis: Analysis
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const platforms = [
  'Auto-detect',
  'CRM',
  'Proposal Engine',
  'Service Dashboard',
  'Customer Portal',
  'Weather AI',
  'Marketing Hub',
  'Venue Vision',
]

const audiences = ['ANC internal team', 'Client team', 'Leadership', 'New user onboarding']

function fileIcon(type: string) {
  if (type.startsWith('video/')) return <FileVideo className="h-4 w-4" />
  if (type.startsWith('audio/')) return <FileAudio className="h-4 w-4" />
  if (type.startsWith('image/')) return <FileImage className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusClass(status: Analysis['status']) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'needs_transcript') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function transcriptSourceLabel(source: Result['transcriptSource']) {
  if (source === 'transcribed_media') return 'Generated from uploaded media'
  if (source === 'pasted') return 'Using pasted transcript'
  if (source === 'uploaded_text') return 'Using uploaded captions/text'
  return 'No transcript yet'
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function WalkthroughLabPage() {
  useAuth('manager')
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('Auto-detect')
  const [audience, setAudience] = useState('ANC internal team')
  const [notes, setNotes] = useState('')
  const [transcript, setTranscript] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')

  const fileSummary = useMemo(() => files.map((file) => ({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
  })), [files])

  function addFiles(next: FileList | File[]) {
    setFiles((current) => {
      const merged = [...current]
      for (const file of Array.from(next)) {
        if (!merged.some((item) => item.name === file.name && item.size === file.size)) {
          merged.push(file)
        }
      }
      return merged.slice(0, 8)
    })
  }

  async function analyze(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    setChatMessages([])
    setChatError('')
    setLoading(true)

    try {
      const form = new FormData()
      form.set('title', title)
      form.set('platform', platform)
      form.set('audience', audience)
      form.set('notes', notes)
      form.set('transcript', transcript)
      files.forEach((file) => form.append('files', file))

      const res = await fetch('/api/walkthrough-lab/analyze', {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Analysis failed (${res.status})`)
      setResult(data)
      if (data.transcript && typeof data.transcript === 'string') {
        setTranscript(data.transcript)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  async function askWalkthrough(questionOverride?: string) {
    const question = (questionOverride || chatInput).trim()
    if (!question || !result || chatLoading) return

    setChatInput('')
    setChatError('')
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: question }]
    setChatMessages(nextMessages)
    setChatLoading(true)

    try {
      const res = await fetch('/api/walkthrough-lab/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          transcript,
          notes,
          analysis: result.analysis,
          history: chatMessages,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Chat failed (${res.status})`)
      setChatMessages([...nextMessages, { role: 'assistant', content: data.answer || 'No answer returned.' }])
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Chat failed')
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#0A52EF]">Walkthrough Lab</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Training diagnosis for screen recordings</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Upload a walkthrough, transcript, captions, screenshots, or rough notes. The lab turns it into feature inventory,
              chapter order, visual QA notes, and ready-to-file knowledge base candidates.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-500 shadow-sm">
            AI source: <span className="font-semibold text-zinc-900">{result?.source === 'ai' ? 'Configured model' : 'Fallback ready'}</span>
            {result ? (
              <span className="ml-3 border-l border-zinc-200 pl-3 font-semibold text-zinc-900">
                {transcriptSourceLabel(result.transcriptSource)}
              </span>
            ) : null}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
          <form onSubmit={analyze} className="space-y-4">
            <Panel title="Walkthrough intake">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Working title</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Customer Portal: creating a service request"
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Platform</label>
                    <select
                      value={platform}
                      onChange={(event) => setPlatform(event.target.value)}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                    >
                      {platforms.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Audience</label>
                    <select
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                    >
                      {audiences.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    addFiles(event.dataTransfer.files)
                  }}
                  className={`flex min-h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed px-5 py-7 text-center transition ${
                    dragging ? 'border-[#0A52EF] bg-[#0A52EF]/5' : 'border-zinc-300 bg-zinc-50 hover:border-[#0A52EF]/45 hover:bg-white'
                  }`}
                >
                  <UploadCloud className="h-8 w-8 text-[#0A52EF]" />
                  <span className="mt-3 text-sm font-semibold text-zinc-950">Upload walkthrough files</span>
                  <span className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                    Video, audio, screenshots, `.txt`, `.vtt`, `.srt`, or notes files. Text/caption files are read immediately.
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="video/*,audio/*,image/*,.txt,.md,.vtt,.srt,.json,.pdf,.doc,.docx"
                  onChange={(event) => addFiles(event.target.files || [])}
                />

                {fileSummary.length > 0 && (
                  <div className="rounded-md border border-zinc-200 bg-white">
                    {fileSummary.map((file) => (
                      <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0">
                        <span className="grid h-8 w-8 place-items-center rounded bg-zinc-100 text-zinc-500">{fileIcon(file.type)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-zinc-900">{file.name}</div>
                          <div className="text-xs text-zinc-400">{file.type || 'unknown'} · {formatBytes(file.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name || item.size !== file.size))}
                          className="text-xs font-semibold text-zinc-400 transition hover:text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Transcript / captions</label>
                  <textarea
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    rows={7}
                    placeholder="Paste transcript, captions, or Otter export here..."
                    className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Recording notes</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    placeholder="What feature were you trying to show? Anything blurry, out of order, or client-facing?"
                    className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                  />
                </div>

                {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || (!transcript.trim() && !notes.trim() && files.length === 0)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? 'Transcribing and analyzing...' : 'Analyze walkthrough'}
                </button>
              </div>
            </Panel>
          </form>

          <section className="space-y-4">
            {!result ? (
              <div className="flex min-h-[560px] items-center justify-center rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <div>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[#0A52EF]/10 text-[#0A52EF]">
                    <FileVideo className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-zinc-950">Upload a walkthrough to diagnose it</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                    Best result: video plus transcript. Good result: pasted notes or captions. Visual screenshots help the review lane.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Panel title="Readout">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">{result.analysis.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">{result.analysis.plainSummary}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClass(result.analysis.status)}`}>
                        {result.analysis.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {result.files.some((file) => file.transcriptStatus) ? (
                      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Media transcription</h3>
                        <div className="space-y-2">
                          {result.files.filter((file) => file.transcriptStatus).map((file) => (
                            <div key={`${file.name}-${file.size}`} className="flex gap-2 text-xs leading-5 text-zinc-600">
                              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                                file.transcriptStatus === 'transcribed' ? 'bg-emerald-500' : file.transcriptStatus === 'failed' ? 'bg-rose-500' : 'bg-amber-500'
                              }`} />
                              <span>
                                <span className="font-semibold text-zinc-900">{file.name}</span>
                                {' '}
                                {file.transcriptStatus === 'transcribed' ? 'transcribed successfully.' : file.transcriptNote || file.transcriptStatus}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.detectedPlatforms.map((item) => (
                        <span key={item} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{item}</span>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel title="Transcript">
                  {result.transcript ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                          {transcriptSourceLabel(result.transcriptSource)}
                        </span>
                        <span className="text-xs font-medium text-zinc-400">{result.transcript.length.toLocaleString()} characters</span>
                      </div>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-6 text-zinc-700">
                        {result.transcript}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-zinc-500">No transcript is available yet. Upload captions, paste transcript text, or use a supported audio/video file.</p>
                  )}
                </Panel>

                <Panel title="Chat with this walkthrough">
                  <div className="space-y-4">
                    <div className="min-h-44 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      {chatMessages.length === 0 ? (
                        <div className="flex min-h-36 flex-col items-center justify-center text-center">
                          <MessageSquare className="h-7 w-7 text-[#0A52EF]" />
                          <h3 className="mt-3 text-sm font-semibold text-zinc-950">Ask the transcript what to do next</h3>
                          <p className="mt-1 max-w-md text-xs leading-5 text-zinc-500">
                            Use it to build a recording order, clean up client-facing wording, find missing steps, or turn the walkthrough into a training article.
                          </p>
                        </div>
                      ) : (
                        chatMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`rounded-md px-3 py-2 text-sm leading-6 ${
                              message.role === 'user' ? 'ml-auto max-w-[86%] bg-[#0A52EF] text-white' : 'mr-auto max-w-[92%] border border-zinc-200 bg-white text-zinc-700'
                            }`}
                          >
                            {message.content}
                          </div>
                        ))
                      )}
                      {chatLoading ? (
                        <div className="mr-auto inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reading walkthrough...
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {['What should I record first?', 'Make this client-safe.', 'What is missing?'].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => askWalkthrough(prompt)}
                          disabled={chatLoading}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF] disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        askWalkthrough()
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Ask about the video, transcript, chapters, or KB article..."
                        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || chatLoading}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Send"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                    {chatError ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{chatError}</div> : null}
                  </div>
                </Panel>

                <Panel title="Feature inventory">
                  <div className="space-y-3">
                    {result.analysis.featureInventory.map((item) => (
                      <div key={`${item.feature}-${item.whatItShows}`} className="rounded-md border border-zinc-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold text-zinc-950">{item.feature}</h3>
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{item.confidence}</span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">{item.whatItShows}</p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Recommended recording sequence">
                  <div className="space-y-3">
                    {result.analysis.recommendedChapters.map((chapter, index) => (
                      <div key={`${chapter.title}-${index}`} className="grid gap-3 rounded-md border border-zinc-200 p-3 sm:grid-cols-[44px_minmax(0,1fr)_54px]">
                        <div className="grid h-9 w-9 place-items-center rounded bg-[#0A52EF] text-sm font-bold text-white">{index + 1}</div>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-950">{chapter.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">{chapter.whatToSay}</p>
                        </div>
                        <div className="text-right text-xs font-semibold text-zinc-400">{chapter.length}</div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel title="Visual review">
                    <ul className="space-y-2 text-sm leading-6 text-zinc-600">
                      {result.analysis.visualReview.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </Panel>
                  <Panel title="KB candidates">
                    <div className="space-y-3">
                      {result.analysis.kbCandidates.map((item) => (
                        <div key={item.title}>
                          <div className="text-sm font-semibold text-zinc-950">{item.title}</div>
                          <div className="text-sm leading-6 text-zinc-500">{item.whyItMatters}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                <Panel title="Transcript notes and follow-ups">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Transcript signal</h3>
                      <ul className="space-y-2 text-sm leading-6 text-zinc-600">
                        {result.analysis.transcriptNotes.map((item) => <li key={item}>• {item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Next pass</h3>
                      <ul className="space-y-2 text-sm leading-6 text-zinc-600">
                        {result.analysis.followUps.map((item) => <li key={item}>• {item}</li>)}
                      </ul>
                    </div>
                  </div>
                </Panel>
              </>
            )}
          </section>
        </div>
      </main>
    </DashboardLayout>
  )
}
