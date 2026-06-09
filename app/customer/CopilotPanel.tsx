'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  ticket?: { id: string; ticket_number: number; title: string }
}

const SUGGESTIONS = [
  'Report a display issue',
  "What's the status of my open requests?",
  'My screen is frozen — what should I try?',
]

export default function CopilotPanel({ onTicketCreated }: { onTicketCreated?: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const next: ChatMsg[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/customer/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json().catch(() => ({}))
      setMessages(m => [...m, {
        role: 'assistant',
        content: data.reply || 'Sorry — something went wrong. Please try again.',
        ticket: data.createdTicket || undefined,
      }])
      if (data.createdTicket) onTicketCreated?.()
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry — something went wrong. Please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="cp-chat-fab" aria-label="Open assistant">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Assistant</span>
        </button>
      )}

      {open && (
        <div className="cp-chat-panel">
          <div className="cp-chat-head">
            <div>
              <div className="cp-chat-title">ANC Assistant</div>
              <div className="cp-chat-sub">Report issues · check status · get help</div>
            </div>
            <button onClick={() => setOpen(false)} className="cp-chat-close" aria-label="Close">✕</button>
          </div>

          <div ref={scrollRef} className="cp-chat-body">
            {messages.length === 0 && (
              <div className="cp-chat-empty">
                <p>Hi — I can file a service request for you, check on existing ones, or help troubleshoot a display.</p>
                <div className="cp-chat-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} className="cp-chat-chip">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`cp-chat-msg ${m.role === 'user' ? 'is-user' : 'is-bot'}`}>
                <div className="cp-chat-bubble">
                  {m.role === 'assistant'
                    ? <div className="cp-chat-md"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                    : m.content}
                  {m.ticket && (
                    <button
                      onClick={() => router.push(`/customer/tickets/${m.ticket!.id}`)}
                      className="cp-chat-ticket"
                    >
                      View #{String(m.ticket.ticket_number).padStart(8, '0')} →
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="cp-chat-msg is-bot">
                <div className="cp-chat-bubble cp-chat-typing"><span /><span /><span /></div>
              </div>
            )}
          </div>

          <form
            className="cp-chat-input-row"
            onSubmit={e => { e.preventDefault(); send(input) }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message…"
              className="cp-input"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} className="cp-btn" style={{ padding: '9px 16px' }}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  )
}
