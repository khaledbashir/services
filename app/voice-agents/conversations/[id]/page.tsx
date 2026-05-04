'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  toolCalls: Array<{ id: string; name: string; arguments: string }> | null
  toolCallId: string | null
  toolName: string | null
  createdAt: string
}

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  userId: string
  userName: string | null
  userEmail: string | null
  agent: {
    id: string
    slug: string
    name: string
    description: string | null
    ttsProvider: string
    ttsVoice: string
    llmProvider: string | null
    llmModel: string | null
  }
  messageCount: number
  durationSeconds: number
  status: 'successful' | 'error' | 'empty'
  summary: string | null
  messages: Message[]
}

type Tab = 'transcript' | 'tools'

export default function VoiceConversationDetailPage({ params }: { params: { id: string } }) {
  const [conv, setConv] = useState<Conversation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('transcript')

  useEffect(() => {
    fetch(`/api/voice-agents/conversations/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setConv(data.conversation)
        else setError(data.error || 'Failed to load conversation')
      })
      .catch((err) => setError(String(err)))
  }, [params.id])

  if (error) {
    return (
      <DashboardLayout>
        <main className="mx-auto max-w-3xl px-5 py-10">
          <Link href="/voice-agents/conversations" className="text-sm text-[#0A52EF] hover:underline">
            ← Back to conversations
          </Link>
          <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
        </main>
      </DashboardLayout>
    )
  }

  if (!conv) {
    return (
      <DashboardLayout>
        <main className="mx-auto max-w-3xl px-5 py-10 text-sm text-zinc-500">Loading…</main>
      </DashboardLayout>
    )
  }

  const toolCallCount = conv.messages.reduce(
    (sum, m) => sum + (m.toolCalls ? m.toolCalls.length : 0),
    0
  )

  return (
    <DashboardLayout>
      <main className="min-h-full bg-[var(--anc-page)] text-[var(--anc-text)]">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <Link href="/voice-agents/conversations" className="text-xs text-zinc-500 hover:text-[#0A52EF]">
            ← All conversations
          </Link>

          <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Conversation with</p>
              <h1 className="mt-1 text-2xl font-black">
                <Link href={`/voice-agents/${conv.agent.slug}`} className="hover:text-[#0A52EF]">
                  {conv.agent.name}
                </Link>
              </h1>
              <p className="mt-1 max-w-2xl truncate text-sm text-zinc-600 dark:text-zinc-300" title={conv.title}>
                {conv.title}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">{conv.id}</p>
            </div>
            <StatusPill status={conv.status} />
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
            {/* Transcript column */}
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <nav className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
                <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')}>
                  Transcript ({conv.messageCount})
                </TabButton>
                <TabButton active={tab === 'tools'} onClick={() => setTab('tools')}>
                  Tools used ({toolCallCount})
                </TabButton>
              </nav>

              {conv.summary && tab === 'transcript' && (
                <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Summary</p>
                  <p className="mt-1">{conv.summary}</p>
                </div>
              )}

              {tab === 'transcript' && <Transcript messages={conv.messages} />}
              {tab === 'tools' && <ToolsList messages={conv.messages} />}
            </section>

            {/* Metadata sidebar */}
            <aside className="space-y-3">
              <MetaCard label="Date">
                <p className="font-medium">{new Date(conv.createdAt).toLocaleString()}</p>
              </MetaCard>
              <MetaCard label="Duration">
                <p className="font-medium">{formatDuration(conv.durationSeconds)}</p>
              </MetaCard>
              <MetaCard label="Messages">
                <p className="font-medium">{conv.messageCount}</p>
              </MetaCard>
              <MetaCard label="User">
                <p className="font-medium">{conv.userName || '—'}</p>
                {conv.userEmail && <p className="text-xs text-zinc-500">{conv.userEmail}</p>}
              </MetaCard>
              <MetaCard label="Agent">
                <Link href={`/voice-agents/${conv.agent.slug}`} className="font-medium text-[#0A52EF] hover:underline">
                  {conv.agent.name}
                </Link>
                {conv.agent.description && (
                  <p className="mt-1 text-xs text-zinc-500">{conv.agent.description}</p>
                )}
              </MetaCard>
              <MetaCard label="LLM">
                <p className="font-medium">{conv.agent.llmProvider || 'default pool'}</p>
                {conv.agent.llmModel && <p className="font-mono text-[11px] text-zinc-500">{conv.agent.llmModel}</p>}
              </MetaCard>
              <MetaCard label="Voice">
                <p className="font-medium">{conv.agent.ttsProvider}</p>
                <p className="font-mono text-[11px] text-zinc-500">{conv.agent.ttsVoice}</p>
              </MetaCard>
            </aside>
          </div>
        </div>
      </main>
    </DashboardLayout>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
        active ? 'border-[#0A52EF] text-[#0A52EF]' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function Transcript({ messages }: { messages: Message[] }) {
  // Group consecutive tool/tool-call messages with the assistant turn that
  // triggered them so the transcript reads as one assistant action instead
  // of dozens of raw rows.
  const visible = messages.filter((m) => m.role !== 'system' && m.role !== 'tool')

  if (visible.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">No messages in this conversation.</p>
  }

  return (
    <div className="space-y-3">
      {visible.map((m) => {
        const toolResultsForThisTurn =
          m.role === 'assistant' && m.toolCalls
            ? messages.filter(
                (msg) =>
                  msg.role === 'tool' &&
                  m.toolCalls!.some((c) => c.id === msg.toolCallId)
              )
            : []

        const isUser = m.role === 'user'
        return (
          <div key={m.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                isUser
                  ? 'max-w-[82%] rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white'
                  : 'max-w-[82%] rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
              }
            >
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                {isUser ? 'User' : 'Assistant'} · {formatTime(m.createdAt)}
              </p>
              {m.content && <p className="mt-1 whitespace-pre-wrap">{m.content}</p>}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <details className="mt-2 text-xs opacity-80">
                  <summary className="cursor-pointer font-semibold">
                    {m.toolCalls.length} tool call{m.toolCalls.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {m.toolCalls.map((c) => {
                      const result = toolResultsForThisTurn.find((r) => r.toolCallId === c.id)
                      return (
                        <li key={c.id} className="rounded-md bg-black/10 p-2 font-mono text-[11px] dark:bg-white/10">
                          <p className="font-semibold">→ {c.name}</p>
                          {c.arguments && (
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] opacity-80">{prettyJson(c.arguments)}</pre>
                          )}
                          {result?.content && (
                            <>
                              <p className="mt-2 font-semibold">← result</p>
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] opacity-80">{result.content.slice(0, 800)}{result.content.length > 800 ? '…' : ''}</pre>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ToolsList({ messages }: { messages: Message[] }) {
  const calls: Array<{ id: string; name: string; args: string; result: string | null; at: string }> = []
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.toolCalls) continue
    for (const c of m.toolCalls) {
      const resultMsg = messages.find((r) => r.role === 'tool' && r.toolCallId === c.id)
      calls.push({
        id: c.id,
        name: c.name,
        args: c.arguments,
        result: resultMsg?.content || null,
        at: m.createdAt,
      })
    }
  }
  if (calls.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">No tools were called in this conversation.</p>
  }
  return (
    <ul className="space-y-3">
      {calls.map((c) => (
        <li key={c.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono font-bold">{c.name}</p>
            <p className="text-zinc-500">{formatTime(c.at)}</p>
          </div>
          {c.args && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{prettyJson(c.args)}</pre>
          )}
          {c.result && (
            <>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Result</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{c.result.slice(0, 1200)}{c.result.length > 1200 ? '…' : ''}</pre>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function MetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  )
}

function StatusPill({ status }: { status: Conversation['status'] }) {
  const cls =
    status === 'successful'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'error'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  const label = status === 'successful' ? 'Successful' : status === 'error' ? 'Error' : 'Empty'
  return <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${cls}`}>{label}</span>
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
