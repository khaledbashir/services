'use client'

import { cn } from '@/lib/utils'
import type { GeneratedCampaignArtifact } from '@/lib/marketing/compose-generate'
import type { ComposeStreamEvent } from '@/lib/marketing/compose-stream'
import type { NewsletterSection, NewsletterVisualDocument } from '@/lib/marketing/newsletter-visual'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  Megaphone,
  Monitor,
  Send,
  Smartphone,
  User,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

type ChatMessage = {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
}

type DonePayload = {
  artifact: GeneratedCampaignArtifact
  visual: NewsletterVisualDocument
  audienceId: string | null
  audienceName: string | null
  runId?: string | null
}

type ComposeRun = {
  id: string
  brief: string
  subject: string
  preview_text: string
  audience_name: string | null
  status: string
  campaign_id: string | null
  author_name: string | null
  created_at: string
}

const QUICK_PROMPTS = [
  'Weekly Media & Partnerships digest: partner wins, venue moments, one approval-ready CTA.',
  'Hornets home stretch update for sponsors and media partners.',
  'Post-game recap newsletter with spotlight on LED moments and fan engagement.',
]

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseSseChunk(raw: string): ComposeStreamEvent[] {
  const events: ComposeStreamEvent[] = []
  for (const block of raw.split('\n\n')) {
    const line = block.trim()
    if (!line.startsWith('data:')) continue
    try {
      events.push(JSON.parse(line.replace(/^data:\s*/, '')) as ComposeStreamEvent)
    } catch {
      // ignore malformed chunks
    }
  }
  return events
}

function SocialChip({ platform, text }: { platform: string; text: string }) {
  const label = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00A3FF]">
        <Megaphone className="size-3" />
        {label}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-300">{text}</p>
    </motion.div>
  )
}

export function MarketingAgentStudio() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: 'Tell me what the marketing team needs to ship. I will use ANC audience context, draft the newsletter, render it in brand, and prepare the social copy for review.',
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'context' | 'generate' | 'render' | 'social' | 'done'>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [outline, setOutline] = useState<string[]>([])
  const [revealedSections, setRevealedSections] = useState<Array<{ label: string; section: NewsletterSection }>>([])
  const [social, setSocial] = useState<{ linkedin?: string; x?: string; slack?: string }>({})
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewMeta, setPreviewMeta] = useState({ subject: '', previewText: '' })
  const [contextStats, setContextStats] = useState<{ subscribed: number; newsletterActive: number; crmLinkedPct: number } | null>(null)
  const [donePayload, setDonePayload] = useState<DonePayload | null>(null)
  const [staging, setStaging] = useState(false)
  const [stageResult, setStageResult] = useState<{ editUrl?: string; approvalId?: string } | null>(null)
  const [error, setError] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [runs, setRuns] = useState<ComposeRun[] | null>(null)
  const [loadingRun, setLoadingRun] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [showTest, setShowTest] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming, phase])

  const resetSandbox = useCallback(() => {
    setPhase('idle')
    setStatusDetail('')
    setOutline([])
    setRevealedSections([])
    setSocial({})
    setPreviewHtml('')
    setPreviewMeta({ subject: '', previewText: '' })
    setContextStats(null)
    setDonePayload(null)
    setStageResult(null)
    setError('')
  }, [])

  const handleStreamEvent = useCallback((event: ComposeStreamEvent) => {
    switch (event.type) {
      case 'agent':
        setMessages((prev) => [...prev, { id: uid(), role: 'agent', text: event.text }])
        break
      case 'status':
        setPhase(event.step === 'social' ? 'social' : event.step === 'generate' ? 'generate' : 'context')
        setStatusDetail(event.detail || '')
        break
      case 'context':
        setContextStats(event.stats)
        break
      case 'outline':
        setOutline(event.items)
        setPhase('render')
        break
      case 'section':
        setRevealedSections((prev) => [...prev, { label: event.label, section: event.section }])
        break
      case 'social':
        setSocial((prev) => ({ ...prev, [event.platform]: event.text }))
        break
      case 'preview':
        setPreviewHtml(event.html)
        setPreviewMeta({ subject: event.subject, previewText: event.previewText })
        break
      case 'done':
        setDonePayload({
          artifact: event.artifact,
          visual: event.visual,
          audienceId: event.audienceId,
          audienceName: event.audienceName,
          runId: event.runId ?? null,
        })
        setPhase('done')
        setStreaming(false)
        break
      case 'error':
        setError(event.message)
        setMessages((prev) => [...prev, { id: uid(), role: 'system', text: event.message }])
        setStreaming(false)
        setPhase('idle')
        break
    }
  }, [])

  const runBrief = useCallback(
    async (brief: string) => {
      const trimmed = brief.trim()
      if (!trimmed || streaming) return

      setMessages((prev) => [...prev, { id: uid(), role: 'user', text: trimmed }])
      setInput('')
      resetSandbox()
      setStreaming(true)
      setPhase('context')
      setStatusDetail('Connecting to marketing data…')

      try {
        const res = await fetch('/api/marketing/compose/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief: trimmed }),
        })

        if (!res.ok || !res.body) {
          throw new Error('Stream failed to start')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const part of parts) {
            for (const event of parseSseChunk(part)) {
              handleStreamEvent(event)
            }
          }
        }

        if (buffer.trim()) {
          for (const event of parseSseChunk(buffer)) {
            handleStreamEvent(event)
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        setError(msg)
        setMessages((prev) => [...prev, { id: uid(), role: 'system', text: msg }])
      } finally {
        setStreaming((current) => {
          if (current) setPhase((p) => (p === 'context' || p === 'generate' ? 'idle' : p))
          return false
        })
      }
    },
    [streaming, resetSandbox, handleStreamEvent],
  )

  async function shipForApproval() {
    if (!donePayload || staging) return
    setStaging(true)
    setError('')
    try {
      const res = await fetch('/api/marketing/compose/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audienceId: donePayload.audienceId,
          name: donePayload.artifact.name,
          subject: donePayload.artifact.subject,
          previewText: donePayload.artifact.previewText,
          visual: donePayload.visual,
          social: donePayload.artifact.social,
          requestApproval: true,
          runId: donePayload.runId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Staging failed')
      setStageResult({ editUrl: data.editUrl, approvalId: data.approvalId })
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'agent',
          text: `Staged for approval${donePayload.audienceName ? ` (${donePayload.audienceName})` : ''}. The configured marketing approvers get the gate next.`,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staging failed')
    } finally {
      setStaging(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    void runBrief(input)
  }

  const openHistory = useCallback(async () => {
    setHistoryOpen(true)
    const res = await fetch('/api/marketing/compose/runs')
    const data = await res.json().catch(() => null)
    setRuns(data?.runs || [])
  }, [])

  async function loadRun(run: ComposeRun) {
    setLoadingRun(run.id)
    try {
      const res = await fetch(`/api/marketing/compose/runs/${run.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the run')
      resetSandbox()
      setHistoryOpen(false)
      setPreviewHtml(data.html)
      setPreviewMeta({ subject: data.run.subject, previewText: data.run.preview_text })
      setOutline((data.run.artifact?.sections || []).map((s: any) => s.headline || s.type).slice(0, 6))
      setSocial(data.run.artifact?.social || {})
      setDonePayload({
        artifact: data.run.artifact,
        visual: data.run.visual,
        audienceId: data.run.audience_id || null,
        audienceName: data.run.audience_name || null,
        runId: data.run.id,
      })
      setPhase('done')
      setMessages((prev) => [...prev, { id: uid(), role: 'agent', text: `Loaded from history: “${data.run.subject}” (${new Date(data.run.created_at).toLocaleString()}).` }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the run')
    } finally {
      setLoadingRun(null)
    }
  }

  async function sendTest() {
    if (!previewHtml || !testEmail.trim() || testState === 'sending') return
    setTestState('sending')
    try {
      const res = await fetch('/api/marketing/newsletter/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim(), subject: `[TEST] ${previewMeta.subject || 'ANC Newsletter'}`, html: previewHtml }),
      })
      setTestState(res.ok ? 'sent' : 'failed')
      setTimeout(() => setTestState('idle'), 4000)
    } catch {
      setTestState('failed')
      setTimeout(() => setTestState('idle'), 4000)
    }
  }

  const sandboxEmpty = phase === 'idle' && !previewHtml

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#07111F] shadow-[0_40px_120px_rgba(0,0,0,0.42)]">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#09182A] px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/marketing-hub"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Hub
          </Link>
          <div className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-16 items-center justify-center rounded-md border border-white/10 bg-white px-2">
              <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="max-h-6 w-auto" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">ANC Marketing Studio</p>
              <p className="text-[11px] text-slate-400">Brief · generate · preview · approval</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (historyOpen ? setHistoryOpen(false) : void openHistory())}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
              historyOpen ? 'border-[#0A52EF]/50 bg-[#0A52EF]/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:text-white',
            )}
          >
            <History className="size-3.5" />
            History
          </button>
          {stageResult?.editUrl && (
            <Link
              href={stageResult.editUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300"
            >
              <CheckCircle2 className="size-3.5" />
              Open draft
              <ExternalLink className="size-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => void shipForApproval()}
            disabled={!donePayload || staging || !!stageResult}
            className="inline-flex items-center gap-2 rounded-md bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2B66F6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {staging ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Ship for approval
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Agent panel — chat, or generation history when toggled */}
        <div className="flex min-h-0 flex-col border-b border-white/10 bg-[#081525] lg:border-b-0 lg:border-r lg:border-white/10">
          {historyOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Generation history — every run is kept
              </p>
              {runs === null ? (
                <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> Loading…</div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-slate-500">No runs yet — brief the agent and the first one lands here.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => void loadRun(run)}
                      disabled={loadingRun === run.id}
                      className="block w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-left transition-colors hover:border-[#0A52EF]/50 hover:bg-[#0A52EF]/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-slate-100">{run.subject || 'Untitled draft'}</p>
                        {run.status === 'staged' ? (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Staged</span>
                        ) : (
                          <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Draft</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{run.brief}</p>
                      <p className="mt-1.5 text-[10px] text-slate-600">
                        {new Date(run.created_at).toLocaleString()} · {run.audience_name || 'no audience'}{run.author_name ? ` · ${run.author_name}` : ''}
                        {loadingRun === run.id ? ' · loading…' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mb-4 rounded-lg border border-[#0A52EF]/30 bg-[#0A52EF]/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8FB5FF]">Brand lock</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                ANC blue, deep navy, white, real venue context, no random palettes.
              </p>
            </div>
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
                >
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      msg.role === 'user' ? 'bg-[#0A52EF]' : msg.role === 'system' ? 'bg-red-500/20' : 'bg-white/10',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <User className="size-4 text-zinc-300" />
                    ) : (
                      <Bot className={cn('size-4', msg.role === 'system' ? 'text-red-400' : 'text-[#00A3FF]')} />
                    )}
                  </div>
                  <div
                    className={cn(
                      'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-[#0A52EF]/90 text-white'
                        : msg.role === 'system'
                          ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                        : 'border border-white/10 bg-white/[0.04] text-slate-200',
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Bot className="size-4 text-[#00A3FF]" />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="size-4 animate-spin text-[#00A3FF]" />
                      {statusDetail || 'Working…'}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {sandboxEmpty && !streaming && (
              <div className="mt-6 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Starting briefs</p>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void runBrief(prompt)}
                    className="block w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left text-xs leading-relaxed text-slate-400 transition-colors hover:border-[#0A52EF]/50 hover:bg-[#0A52EF]/10 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          <form onSubmit={onSubmit} className="shrink-0 border-t border-white/10 p-4">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void runBrief(input)
                  }
                }}
                rows={2}
                placeholder="Write the brief: audience, venue/partner, moment, CTA..."
                disabled={streaming}
                className="w-full resize-none rounded-lg border border-white/10 bg-[#06101C] px-4 py-3 pr-12 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#0A52EF]/60 focus:ring-2 focus:ring-[#0A52EF]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="absolute bottom-2.5 right-2.5 flex size-9 items-center justify-center rounded-md bg-[#0A52EF] text-white transition-colors hover:bg-[#2B66F6] disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Sandbox — autonomous render theater */}
        <div className="flex min-h-0 flex-col bg-[#F3F6FA]">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span
                  className={cn(
                    'absolute inline-flex size-full rounded-full',
                    streaming ? 'animate-ping bg-[#0A52EF]/60' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-400',
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex size-2 rounded-full',
                    streaming ? 'bg-[#0A52EF]' : phase === 'done' ? 'bg-emerald-500' : 'bg-slate-500',
                  )}
                />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {phase === 'idle' && !previewHtml ? 'Sandbox idle' : phase === 'done' ? 'Render complete' : 'Live render'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {contextStats && (
                <div className="hidden text-[11px] tabular-nums text-slate-500 md:block">
                  {contextStats.newsletterActive.toLocaleString()} audience · {contextStats.subscribed.toLocaleString()} send-safe
                </div>
              )}
              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                <button type="button" onClick={() => setDevice('desktop')} title="Desktop preview"
                  className={cn('flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors', device === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  <Monitor className="size-3" /> Desktop
                </button>
                <button type="button" onClick={() => setDevice('mobile')} title="Mobile preview"
                  className={cn('flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors', device === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  <Smartphone className="size-3" /> Mobile
                </button>
              </div>
              {previewHtml && (
                <div className="relative">
                  <button type="button" onClick={() => setShowTest((s) => !s)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-900">
                    {testState === 'sending' ? 'Sending…' : testState === 'sent' ? 'Sent ✓' : testState === 'failed' ? 'Failed' : 'Send test'}
                  </button>
                  {showTest && (
                    <div className="absolute right-0 top-full z-20 mt-1 flex w-64 gap-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                      <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@anc.com" type="email"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-[#0A52EF]" />
                      <button type="button" onClick={() => { void sendTest(); setShowTest(false) }} disabled={!testEmail.trim()}
                        className="rounded bg-[#0A52EF] px-2.5 text-[10px] font-semibold uppercase text-white disabled:opacity-40">Send</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto]">
            <div className="relative min-h-0 overflow-hidden p-4">
              {sandboxEmpty ? (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <div className="mb-4 flex h-16 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-3">
                    <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="max-h-9 w-auto" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">ANC newsletter preview</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                    The generated draft renders here using the locked ANC newsletter system before it goes to approval.
                  </p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center gap-3">
                  {(previewMeta.subject || streaming) && (
                    <div className={cn('w-full shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all', device === 'mobile' ? 'max-w-[375px]' : 'max-w-[720px]')}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">As the recipient sees it</p>
                      <p className="mt-1 truncate text-xs text-slate-500">ANC Sports &lt;notifications@ancsports.net&gt;</p>
                      <p className="truncate text-sm font-semibold text-slate-950">{previewMeta.subject || 'Drafting subject...'}</p>
                      <p className="truncate text-xs text-slate-500">{previewMeta.previewText || 'Preview text loading...'}</p>
                    </div>
                  )}
                  <div className={cn(
                    'relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border bg-white shadow-xl transition-all',
                    device === 'mobile' ? 'max-w-[375px] border-slate-300' : 'max-w-[720px] border-slate-200',
                  )}>
                    {previewHtml ? (
                      <iframe
                        title="Newsletter preview — exactly what recipients receive"
                        srcDoc={previewHtml}
                        className="size-full border-0"
                        sandbox="allow-same-origin"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                        <Loader2 className="mr-2 size-5 animate-spin text-[#0A52EF]" />
                        Composing layout...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Build timeline */}
            <div className="max-h-[220px] shrink-0 overflow-y-auto border-t border-slate-200 bg-white px-4 py-3">
              <AnimatePresence mode="popLayout">
                {outline.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-3"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Outline</p>
                    <div className="flex flex-wrap gap-1.5">
                      {outline.map((item, i) => (
                        <span
                          key={`${item}-${i}`}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {revealedSections.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Blocks rendered</p>
                    <div className="space-y-1">
                      {revealedSections.map((row, i) => (
                        <motion.div
                          key={`${row.label}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-2 text-xs text-slate-600"
                        >
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80" />
                          <span className="truncate">{row.label}</span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                            {row.section.type}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {Object.keys(social).length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid gap-2 sm:grid-cols-3">
                    {social.linkedin && <SocialChip platform="linkedin" text={social.linkedin} />}
                    {social.x && <SocialChip platform="x" text={social.x} />}
                    {social.slack && <SocialChip platform="slack" text={social.slack} />}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && !streaming && (
                <p className="mt-2 text-xs text-red-400">{error}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
