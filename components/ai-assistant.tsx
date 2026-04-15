'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Chat { id: string; title: string; updated_at: string }

interface MessageRow {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> | null
  tool_call_id?: string | null
  tool_name?: string | null
  pending?: boolean
}

interface Skill {
  name: string
  description: string
  category: string
  icon: string
  role: string
}

const STORAGE_KEY = 'ai-panel-open'

export function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [showSkills, setShowSkills] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setOpen(localStorage.getItem(STORAGE_KEY) === '1') }, [])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, open ? '1' : '0') }, [open])

  const loadChats = useCallback(async () => {
    const r = await fetch('/api/ai/chats')
    if (r.ok) setChats((await r.json()).chats || [])
  }, [])

  const loadSkills = useCallback(async () => {
    const r = await fetch('/api/ai/skills')
    if (r.ok) setSkills((await r.json()).skills || [])
  }, [])

  const loadChat = useCallback(async (id: string) => {
    const r = await fetch(`/api/ai/chats/${id}`)
    if (r.ok) {
      const d = await r.json()
      setActiveChatId(id)
      setMessages(d.messages || [])
    }
  }, [])

  useEffect(() => { if (open) { loadChats(); loadSkills() } }, [open, loadChats, loadSkills])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const newChat = () => {
    setActiveChatId(null)
    setMessages([])
    setHistoryOpen(false)
    setInput('')
  }

  const deleteChat = async (id: string) => {
    if (!confirm('Delete this chat?')) return
    await fetch(`/api/ai/chats/${id}`, { method: 'DELETE' })
    if (activeChatId === id) newChat()
    loadChats()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')

    const optimisticUser: MessageRow = { role: 'user', content: text }
    const pendingAssistant: MessageRow = { role: 'assistant', content: '', pending: true }
    setMessages(prev => [...prev, optimisticUser, pendingAssistant])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ chat_id: activeChatId, message: text }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawText = false
      let assistantText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const chunk of events) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'chat' && ev.data?.id && !activeChatId) {
              setActiveChatId(ev.data.id)
            } else if (ev.type === 'text') {
              if (typeof ev.data === 'string' && ev.data.length > 0) {
                assistantText += ev.data + '\n\n'
                sawText = true
                setMessages(prev => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last && last.pending) copy[copy.length - 1] = { ...last, content: assistantText.trim() }
                  return copy
                })
              }
            } else if (ev.type === 'tool_call') {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last && last.pending) {
                  copy[copy.length - 1] = {
                    ...last,
                    content: (last.content || '') + `\n\n🔧 Running \`${ev.data.name}\`…`,
                  }
                }
                return copy
              })
            } else if (ev.type === 'tool_result') {
              // Leave the running line; tool result is persisted server-side.
            } else if (ev.type === 'error') {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last && last.pending) copy[copy.length - 1] = { ...last, content: `⚠️ ${ev.data}`, pending: false }
                return copy
              })
            }
          } catch {}
        }
      }

      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.pending) {
          copy[copy.length - 1] = {
            ...last,
            pending: false,
            content: sawText ? assistantText.trim() : 'Done.',
          }
        }
        return copy
      })
      loadChats()
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.pending) copy[copy.length - 1] = { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : String(err)}` }
        return copy
      })
    } finally {
      setSending(false)
    }
  }

  const skillsByCategory: Record<string, Skill[]> = {}
  for (const s of skills) (skillsByCategory[s.category] ||= []).push(s)

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-[#0A52EF] text-white shadow-lg hover:bg-[#0840C0] flex items-center justify-center transition-transform hover:scale-105"
        aria-label="Open ANC assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white border-l border-[#E8E8E8] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0A52EF]">ANC Assistant</span>
              {activeChatId ? (
                <span className="text-xs text-zinc-500 truncate max-w-[160px]">
                  {chats.find(c => c.id === activeChatId)?.title || 'Chat'}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={newChat} title="New chat"
                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600" aria-label="New chat">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m-3-3h6m7-3A9 9 0 11 3 12a9 9 0 0118 0z" /></svg>
              </button>
              <button onClick={() => setHistoryOpen(v => !v)} title="Chat history"
                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600" aria-label="History">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button onClick={() => setShowSkills(v => !v)} title="Skills"
                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600" aria-label="Skills">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </button>
              <button onClick={() => setOpen(false)} title="Close"
                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {historyOpen && (
            <div className="border-b border-[#E8E8E8] bg-zinc-50/60 max-h-64 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">No chats yet.</div>
              ) : chats.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2 hover:bg-white">
                  <button onClick={() => { loadChat(c.id); setHistoryOpen(false) }}
                    className={`flex-1 text-left text-sm truncate ${activeChatId === c.id ? 'text-[#0A52EF] font-medium' : 'text-zinc-700'}`}>
                    {c.title}
                  </button>
                  <button onClick={() => deleteChat(c.id)} className="text-zinc-400 hover:text-red-600 p-1" aria-label="Delete chat">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {showSkills && (
            <div className="border-b border-[#E8E8E8] bg-zinc-50/60 max-h-72 overflow-y-auto p-3 space-y-3">
              {Object.keys(skillsByCategory).sort().map(cat => (
                <div key={cat}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1">{cat}</div>
                  <div className="space-y-1">
                    {skillsByCategory[cat].map(s => (
                      <div key={s.name} className="flex items-start gap-2 text-xs text-zinc-600 px-2 py-1.5 rounded hover:bg-white">
                        <span className="text-sm">{s.icon}</span>
                        <div>
                          <div className="font-medium text-zinc-800">{s.name}</div>
                          <div className="text-zinc-500">{s.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-sm text-zinc-400 mt-16 space-y-2">
                <div className="text-2xl">👋</div>
                <div>Ask me to pull events, create a ticket, log a walkthrough, or spin up a design request.</div>
              </div>
            ) : messages.filter(m => m.role !== 'tool' && m.role !== 'system').map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-[#0A52EF] text-white'
                    : 'bg-zinc-100 text-zinc-800'
                }`}>
                  {m.content || (m.pending ? '…' : '')}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#E8E8E8]">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Message the assistant…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-[#E8E8E8] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 max-h-32"
                disabled={sending}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="rounded-xl bg-[#0A52EF] text-white px-3 py-2 text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
