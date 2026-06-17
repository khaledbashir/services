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
  Loader2,
  Megaphone,
  Send,
  Sparkles,
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
}

const QUICK_PROMPTS = [
  'Weekly Media & Partnerships digest — partner wins, venue moments, one CTA.',
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
      className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7350FF]">
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
      text: 'I’m your marketing agent. Tell me what the marketing team should ship — I’ll pull live audience data, draft the newsletter, and render it in the sandbox.',
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

  const sandboxEmpty = phase === 'idle' && !previewHtml

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#08090e] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/marketing-hub"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="size-3.5" />
            Hub
          </Link>
          <div className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7350FF] to-[#0A52EF]">
              <Sparkles className="size-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Marketing Agent</p>
              <p className="text-[11px] text-zinc-500">Chat → generate → sandbox render</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            className="inline-flex items-center gap-2 rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2B66F6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {staging ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Ship for approval
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Agent panel — only interaction surface */}
        <div className="flex min-h-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
                >
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      msg.role === 'user' ? 'bg-zinc-800' : msg.role === 'system' ? 'bg-red-500/20' : 'bg-[#7350FF]/20',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <User className="size-4 text-zinc-300" />
                    ) : (
                      <Bot className={cn('size-4', msg.role === 'system' ? 'text-red-400' : 'text-[#7350FF]')} />
                    )}
                  </div>
                  <div
                    className={cn(
                      'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-[#0A52EF]/90 text-white'
                        : msg.role === 'system'
                          ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                          : 'border border-white/8 bg-white/[0.04] text-zinc-200',
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#7350FF]/20">
                    <Bot className="size-4 text-[#7350FF]" />
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="size-4 animate-spin text-[#7350FF]" />
                      {statusDetail || 'Working…'}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {sandboxEmpty && !streaming && (
              <div className="mt-6 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Try</p>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void runBrief(prompt)}
                    className="block w-full rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left text-xs leading-relaxed text-zinc-400 transition-colors hover:border-[#7350FF]/40 hover:bg-[#7350FF]/5 hover:text-zinc-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="shrink-0 border-t border-white/8 p-4">
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
                placeholder="What should marketing ship this week?"
                disabled={streaming}
                className="w-full resize-none rounded-xl border border-white/10 bg-[#0c0d14] px-4 py-3 pr-12 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#7350FF]/50 focus:ring-2 focus:ring-[#7350FF]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="absolute bottom-2.5 right-2.5 flex size-9 items-center justify-center rounded-lg bg-[#7350FF] text-white transition-colors hover:bg-[#8465ff] disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Sandbox — autonomous render theater */}
        <div className="flex min-h-0 flex-col bg-[#050608]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span
                  className={cn(
                    'absolute inline-flex size-full rounded-full',
                    streaming ? 'animate-ping bg-[#7350FF]/60' : phase === 'done' ? 'bg-emerald-400' : 'bg-zinc-600',
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex size-2 rounded-full',
                    streaming ? 'bg-[#7350FF]' : phase === 'done' ? 'bg-emerald-500' : 'bg-zinc-500',
                  )}
                />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {phase === 'idle' && !previewHtml ? 'Sandbox idle' : phase === 'done' ? 'Render complete' : 'Live render'}
              </span>
            </div>
            {contextStats && (
              <div className="hidden text-[11px] tabular-nums text-zinc-500 sm:block">
                {contextStats.newsletterActive.toLocaleString()} audience · {contextStats.subscribed.toLocaleString()} send-safe
              </div>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto]">
            <div className="relative min-h-0 overflow-hidden p-4">
              {sandboxEmpty ? (
                <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-gradient-to-br from-[#7350FF]/5 via-transparent to-[#0A52EF]/5 p-8 text-center">
                  <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/5">
                    <Sparkles className="size-8 text-[#7350FF]/80" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Generation theater</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
                    The agent builds your newsletter here block by block — no forms, no code dumps. Just tell it what to ship.
                  </p>
                </div>
              ) : (
                <div className="flex h-full flex-col gap-3">
                  {(previewMeta.subject || streaming) && (
                    <div className="shrink-0 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Inbox preview</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">{previewMeta.subject || 'Drafting subject…'}</p>
                      <p className="truncate text-xs text-zinc-500">{previewMeta.previewText || 'Preview text loading…'}</p>
                    </div>
                  )}
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
                    {previewHtml ? (
                      <iframe
                        title="Newsletter sandbox"
                        srcDoc={previewHtml}
                        className="size-full border-0"
                        sandbox="allow-same-origin"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                        <Loader2 className="mr-2 size-5 animate-spin text-[#7350FF]" />
                        Composing layout…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Build timeline */}
            <div className="max-h-[220px] shrink-0 overflow-y-auto border-t border-white/8 bg-[#08090e]/80 px-4 py-3">
              <AnimatePresence mode="popLayout">
                {outline.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-3"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Outline</p>
                    <div className="flex flex-wrap gap-1.5">
                      {outline.map((item, i) => (
                        <span
                          key={`${item}-${i}`}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {revealedSections.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Blocks rendered</p>
                    <div className="space-y-1">
                      {revealedSections.map((row, i) => (
                        <motion.div
                          key={`${row.label}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-2 text-xs text-zinc-400"
                        >
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80" />
                          <span className="truncate">{row.label}</span>
                          <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-zinc-600">
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
