'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sources?: Array<{ title: string; url: string }>
}

const SUGGESTED_PROMPTS: Array<{ icon: string; label: string; prompt: string }> = [
  { icon: '📊', label: 'This month vs last', prompt: 'Compare this month\'s retainer burn, change-order volume, and SaaS spend against last month. What stands out?' },
  { icon: '✂️', label: 'Where am I overspending?', prompt: 'Look at the SaaS / cloud receipt vault. Which vendors look high relative to typical small-business benchmarks? Use web search to find typical rates and cite sources.' },
  { icon: '🎯', label: 'What to cut?', prompt: 'Audit the recurring SaaS vendors. Where do I have overlapping coverage (two AI tools, two cloud providers, etc.)? Recommend specific cuts with rough monthly savings.' },
  { icon: '⚠️', label: 'Biggest risk?', prompt: 'What\'s the single biggest financial or operational risk in the current dashboard state? Be direct.' },
  { icon: '📈', label: 'Year projection', prompt: 'Project annual SaaS spend at the current run rate. Flag any vendor whose YoY trajectory is concerning. Use web search if you need pricing comparisons.' },
  { icon: '🔍', label: 'Vendor benchmark', prompt: 'For my top 3 vendors by spend, find current market pricing for similar services using web search. Am I paying market, above, or below?' },
]

function genSessionId(): string {
  // AnythingLLM validates sessionId as a UUID v4 — anything else returns
  // "Invalid session ID."
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-'
    else if (i === 14) out += '4'
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)]
    else out += hex[Math.floor(Math.random() * 16)]
  }
  return out
}

// Minimal markdown → HTML — bold, italic, links, lists, paragraphs, inline
// code, fenced code. Keeps the dependency footprint small.
function renderMarkdown(text: string): string {
  if (!text) return ''
  // Escape HTML first
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = esc(text)
  // Fenced code blocks
  html = html.replace(/```(?:[\w-]+)?\n([\s\S]*?)```/g, (_, code) => `<pre class="rounded-md bg-gray-100 dark:bg-gray-800 p-3 text-[12px] overflow-x-auto my-2"><code>${code.trim()}</code></pre>`)
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[12px]">$1</code>')
  // Bold + italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">$1</a>')
  // Bare URLs
  html = html.replace(/(^|[\s])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">$2</a>')
  // Lists
  html = html.replace(/(^|\n)(?:[-*]\s+.+(?:\n|$))+/g, (match) => {
    const items = match.trim().split('\n').map((line) => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean)
    return '\n<ul class="list-disc pl-5 my-2 space-y-1">' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>'
  })
  html = html.replace(/(^|\n)(?:\d+\.\s+.+(?:\n|$))+/g, (match) => {
    const items = match.trim().split('\n').map((line) => line.replace(/^\d+\.\s+/, '').trim()).filter(Boolean)
    return '\n<ol class="list-decimal pl-5 my-2 space-y-1">' + items.map((i) => `<li>${i}</li>`).join('') + '</ol>'
  })
  // Headings
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
  // Paragraphs from double-newline
  html = html.split(/\n{2,}/).map((para) => {
    if (/^<(h\d|ul|ol|pre|blockquote)/.test(para.trim())) return para
    return `<p class="my-1">${para.replace(/\n/g, '<br/>')}</p>`
  }).join('\n')
  return html
}

export default function ConsultantClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')
  const [useAgent, setUseAgent] = useState(true)
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Persist session id across reloads
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('anc-consultant-session')
      if (stored) {
        setSessionId(stored)
      } else {
        const sid = genSessionId()
        window.localStorage.setItem('anc-consultant-session', sid)
        setSessionId(sid)
      }
    } catch {
      setSessionId(genSessionId())
    }
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending || !sessionId) return

    const userMsg: ChatMessage = { id: genSessionId(), role: 'user', content: trimmed }
    const assistantMsg: ChatMessage = { id: genSessionId(), role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/consultant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId, useAgent }),
      })
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => '')
        throw new Error(err || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let textBuffer = ''
      const sources: Array<{ title: string; url: string }> = []

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames separated by \n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n').filter((l) => l.startsWith('data: '))
          for (const line of lines) {
            const payload = line.slice(6).trim()
            if (!payload) continue
            try {
              const obj = JSON.parse(payload)
              // AnythingLLM streams chunks with { type, textResponse, sources, close, ... }
              if (typeof obj.textResponse === 'string' && obj.textResponse) {
                textBuffer += obj.textResponse
                setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: textBuffer } : m))
              }
              if (Array.isArray(obj.sources)) {
                for (const s of obj.sources) {
                  if (s?.url && !sources.find((x) => x.url === s.url)) {
                    sources.push({ title: s.title || s.chunkSource || s.url, url: s.url })
                  }
                }
              }
            } catch {
              // Non-JSON payload — append as raw text
              textBuffer += payload
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: textBuffer } : m))
            }
          }
        }
      }

      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false, sources: sources.length ? sources : undefined } : m))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Advisor unavailable'
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `_Sorry — ${message}_`, streaming: false } : m))
    } finally {
      setSending(false)
    }
  }, [sending, sessionId, useAgent])

  function newConversation() {
    const sid = genSessionId()
    try { window.localStorage.setItem('anc-consultant-session', sid) } catch {}
    setSessionId(sid)
    setMessages([])
  }

  const isEmpty = messages.length === 0

  return (
    <div className="max-w-4xl mx-auto px-6 pt-8 pb-32 w-full min-w-0 flex flex-col" style={{ minHeight: 'calc(100vh - 40px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <span>Advisor</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">live</span>
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
            Executive-level counsel grounded in your live ANC numbers and the public web. Ask anything — strategy, spending, benchmarks, risks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useAgent}
              onChange={(e) => setUseAgent(e.target.checked)}
              className="rounded"
            />
            Web search
          </label>
          {messages.length > 0 && (
            <button
              onClick={newConversation}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Empty state with suggestions */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <div className="text-5xl mb-4">🧭</div>
          <h2 className="text-xl font-semibold mb-2">What should I look at?</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md">
            Start with one of these, or type your own question below. The advisor has read access to your retainer meter, expenses, change orders, service log, and the live web.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p.label}
                onClick={() => send(p.prompt)}
                disabled={sending}
                className="text-left p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{p.icon}</span>
                  <span className="font-semibold text-sm">{p.label}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{p.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation */}
      {!isEmpty && (
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.role === 'user'
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
              }`}>
                {m.role === 'assistant' ? (
                  <>
                    <div
                      className="text-sm leading-relaxed prose-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content || (m.streaming ? '' : '_thinking…_')) }}
                    />
                    {m.streaming && <span className="inline-block w-1.5 h-3 ml-1 bg-current rounded-sm animate-pulse" />}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Sources</div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.sources.map((s, i) => (
                            <a
                              key={i}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 truncate max-w-[280px]"
                            >
                              {s.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="sticky bottom-0 pt-3 mt-4 bg-gradient-to-t from-gray-50 dark:from-gray-950 to-transparent">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-2 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={sending ? 'Thinking…' : 'Ask the advisor anything — strategy, spending, benchmarks, risks…'}
            rows={1}
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm bg-transparent resize-none focus:outline-none disabled:opacity-50 min-h-[40px] max-h-[180px]"
            style={{ height: Math.min(180, Math.max(40, input.split('\n').length * 24 + 16)) + 'px' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || sending}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {sending ? '…' : 'Ask'}
          </button>
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
          The advisor has read-only access to your dashboard data. {useAgent ? 'Web search is on.' : 'Web search is off.'}
        </div>
      </div>
    </div>
  )
}
