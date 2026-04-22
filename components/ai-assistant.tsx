'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { dispatchUiAction, type UiAction } from './ai-ui-driver'

interface Chat { id: string; title: string; updated_at: string }

interface ThoughtStep {
  kind: 'tool_call' | 'tool_result' | 'text' | 'error'
  name?: string
  args?: string
  result?: string
  text?: string
  at: number
}

interface MessageRow {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  pending?: boolean
  steps?: ThoughtStep[]
  suggestions?: string[]
}

const DEFAULT_SUGGESTIONS = [
  'Show me events this week',
  'Open the Prudential Center page',
  'Create a design request',
  'What tickets are open?',
  'List my venues with no feed URL',
]

// Strip a <suggestions>[...]</suggestions> block (if present) from the
// assistant text and return both. The agent emits suggestions inline so
// we parse them client-side. The parser tolerates code fences, stray
// whitespace, missing closing tag, and single-quote arrays.
function extractSuggestions(text: string): { clean: string; suggestions?: string[] } {
  // Accept open+close, or just open through end-of-text (model truncation).
  const m =
    text.match(/<suggestions>([\s\S]*?)<\/suggestions>/i) ||
    text.match(/<suggestions>([\s\S]*)$/i)
  if (!m) return { clean: text }
  // Strip code fences the model sometimes adds around the JSON.
  const raw = m[1]
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  let arr: unknown
  try { arr = JSON.parse(raw) } catch {
    // Second chance — swap single quotes for double quotes.
    try { arr = JSON.parse(raw.replace(/'/g, '"')) } catch {}
  }
  const clean = text.replace(m[0], '').trim()
  if (Array.isArray(arr)) {
    const cleaned = arr.map(String).map(s => s.trim()).filter(s => s.length > 0 && s.length < 80)
    if (cleaned.length > 0) return { clean, suggestions: cleaned.slice(0, 5) }
  }
  return { clean }
}

// When the model forgot its <suggestions> block, fall back to contextual
// chips derived from what it actually said. Order of preference:
//   1. Any sentences ending in "?" — those are questions the user should answer
//   2. Bullet points (- xxx) from the text — those are often actionable items
//   3. Topic-matched defaults (if the text mentions "ticket", "design", ...)
//   4. Global DEFAULT_SUGGESTIONS
function buildFallbackSuggestions(text: string, userMessage?: string): string[] {
  const out: string[] = []
  const plain = text.replace(/`[^`]+`/g, '').replace(/\*\*/g, '')

  // Questions the model posed back to the user.
  const questions = plain.match(/([A-Z][^.?!\n]{3,70}\?)/g) || []
  for (const q of questions.slice(0, 3)) out.push(q.trim())

  // Bullet items (often "next step" lists).
  const bullets = plain.match(/^[ ]*[-*][ ]+([^\n]{3,60})/gm) || []
  for (const b of bullets.slice(0, 3)) {
    const cleaned = b.replace(/^[ ]*[-*][ ]+/, '').trim()
    if (!out.includes(cleaned)) out.push(cleaned)
  }

  // Topic-based defaults.
  const topic = `${text} ${userMessage || ''}`.toLowerCase()
  const TOPIC_CHIPS: Array<[RegExp, string[]]> = [
    [/ticket/, ['Show open tickets', 'Create a new ticket', 'Show urgent tickets']],
    [/design|proof|creative/, ['Show pending designs', 'Move one to client review', 'Create a design request']],
    [/event|game/, ['Events this week', 'Unassigned events', 'Tomorrow\'s schedule']],
    [/venue|prudential|stadium|arena/, ['List all venues', 'Venues with no feed', 'Open Prudential']],
    [/staff|technician|assign/, ['Find a tech near a venue', 'Who\'s working tomorrow']],
    [/maintenance|walkthrough/, ['Log a walkthrough', 'Log maintenance']],
  ]
  for (const [pat, chips] of TOPIC_CHIPS) {
    if (pat.test(topic)) {
      for (const c of chips) if (!out.includes(c) && out.length < 4) out.push(c)
    }
  }

  // Guaranteed minimum.
  if (out.length < 2) {
    for (const d of DEFAULT_SUGGESTIONS) if (!out.includes(d) && out.length < 4) out.push(d)
  }
  return out.slice(0, 4)
}

interface Skill {
  name: string
  description: string
  category: string
  icon: string
  role: string
}

interface Provider { name: string; model: string }

interface PageContextField {
  selector: string
  label?: string
  type?: string
}

interface PageContext {
  current_path?: string
  page_title?: string
  visible_fields?: PageContextField[]
}

const STORAGE_KEY = 'ai-panel-open'
const PROVIDER_KEY = 'ai-panel-provider'
const ACTIVE_CHAT_KEY = 'ai-active-chat'
const WIDTH_KEY = 'ai-panel-width'
const MIN_WIDTH = 360
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 440

function isVisibleElement(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function cleanFieldLabel(raw?: string | null): string | undefined {
  const label = raw?.replace(/\s+/g, ' ').trim()
  return label ? label.slice(0, 80) : undefined
}

function collectPageContext(pathname: string): PageContext {
  if (typeof document === 'undefined') return { current_path: pathname }

  const fields: PageContextField[] = []
  const seen = new Set<string>()
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select, [data-ai-target]'))

  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)) continue
    if (!isVisibleElement(node) || node.disabled || node.type === 'hidden') continue

    const aiTarget = node.getAttribute('data-ai-target')?.trim()
    const selector = aiTarget ? `[data-ai-target="${aiTarget}"]` : node.id ? `#${node.id}` : ''
    if (!selector || seen.has(selector)) continue

    const labelFromFor = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`) : null
    const wrappedLabel = node.closest('label')
    const siblingLabel = node.parentElement?.querySelector(':scope > label')
    const label = cleanFieldLabel(
      labelFromFor?.textContent ||
      wrappedLabel?.textContent ||
      siblingLabel?.textContent ||
      node.getAttribute('aria-label') ||
      node.getAttribute('placeholder') ||
      aiTarget
    )

    fields.push({
      selector,
      label,
      type: node instanceof HTMLSelectElement ? 'select' : node.type || node.tagName.toLowerCase(),
    })
    seen.add(selector)
    if (fields.length >= 20) break
  }

  return {
    current_path: pathname,
    page_title: document.title || undefined,
    visible_fields: fields,
  }
}

function parseLooseTableRow(line: string): string[] | null {
  if (!line.trim() || line.includes('|')) return null
  if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^\s*>/.test(line)) return null
  const cols = line.trim().split(/\t+| {2,}/).map(part => part.trim()).filter(Boolean)
  if (cols.length < 2 || cols.length > 4) return null
  return cols
}

function normalizeMarkdownTables(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length;) {
    const rows: string[][] = []
    let j = i

    while (j < lines.length) {
      const parsed = parseLooseTableRow(lines[j])
      if (!parsed) break
      if (rows.length > 0 && parsed.length !== rows[0].length) break
      rows.push(parsed)
      j++
    }

    if (rows.length >= 2) {
      out.push(`| ${rows[0].join(' | ')} |`)
      out.push(`| ${rows[0].map(() => '---').join(' | ')} |`)
      for (const row of rows.slice(1)) out.push(`| ${row.join(' | ')} |`)
      i = j
      continue
    }

    out.push(lines[i])
    i++
  }

  return out.join('\n')
}

export function AiAssistant() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpenState] = useState(false)
  const setHistoryOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    setHistoryOpenState(prev => {
      const next = typeof v === 'function' ? (v as (prev: boolean) => boolean)(prev) : v
      if (next) loadChats()
      return next
    })
  }
  const [showSkills, setShowSkills] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH)
  const [resizing, setResizing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setOpen(localStorage.getItem(STORAGE_KEY) === '1')
    setSelectedProvider(localStorage.getItem(PROVIDER_KEY) || '')
    const stored = localStorage.getItem(ACTIVE_CHAT_KEY)
    if (stored) setActiveChatId(stored)
    const savedWidth = Number(localStorage.getItem(WIDTH_KEY))
    if (savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) setWidth(savedWidth)
  }, [])

  // Publish panel width as a CSS variable on <html> so the dashboard layout
  // can apply `padding-right` and shrink the content area instead of being
  // covered by an overlay. Mobile ignores this (handled via media query).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ai-panel-width', open ? `${width}px` : '0px')
    return () => { root.style.setProperty('--ai-panel-width', '0px') }
  }, [open, width])

  // Resize drag handler: grabs the left edge and tracks mouse X globally.
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const next = Math.min(Math.max(window.innerWidth - e.clientX, MIN_WIDTH), MAX_WIDTH)
      setWidth(next)
    }
    const onUp = () => {
      setResizing(false)
      try { localStorage.setItem(WIDTH_KEY, String(width)) } catch {}
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing, width])

  // Persist activeChatId so chat survives reload.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeChatId) localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId)
    else localStorage.removeItem(ACTIVE_CHAT_KEY)
  }, [activeChatId])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, open ? '1' : '0') }, [open])
  useEffect(() => { if (selectedProvider && typeof window !== 'undefined') localStorage.setItem(PROVIDER_KEY, selectedProvider) }, [selectedProvider])

  const loadChats = useCallback(async () => {
    const r = await fetch('/api/ai/chats')
    if (r.ok) setChats((await r.json()).chats || [])
  }, [])
  const loadSkills = useCallback(async () => {
    const r = await fetch('/api/ai/skills')
    if (r.ok) setSkills((await r.json()).skills || [])
  }, [])
  const loadProviders = useCallback(async () => {
    const r = await fetch('/api/ai/providers')
    if (r.ok) {
      const data = await r.json()
      const ranked = [...(data.providers || [])].sort((a: Provider, b: Provider) => {
        const score = (p: Provider) => /gpt|openai/i.test(`${p.name} ${p.model}`) ? 1 : 0
        return score(b) - score(a)
      })
      setProviders(ranked)
      if (!selectedProvider && ranked[0]) setSelectedProvider(ranked[0].name)
    }
  }, [selectedProvider])

  const loadChat = useCallback(async (id: string) => {
    const r = await fetch(`/api/ai/chats/${id}`)
    if (r.ok) {
      const d = await r.json()
      setActiveChatId(id)
      // Hydrate historical messages (no step stream on reload).
      setMessages((d.messages || []).map((m: MessageRow) => ({ ...m, steps: [] })))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadChats()
    loadSkills()
    loadProviders()
    // If the panel reopens with a persisted active chat, hydrate its
    // messages so history survives reloads.
    if (activeChatId && messages.length === 0) {
      loadChat(activeChatId).catch(() => {
        // Chat was deleted or is inaccessible — clear pointer.
        setActiveChatId(null)
      })
    }
    // Autofocus the composer when the panel opens.
    setTimeout(() => inputRef.current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setMessages(prev => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (last?.pending) copy[copy.length - 1] = { ...last, pending: false, content: (last.content || '') + '\n\n_(stopped)_' }
      return copy
    })
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')

    const optimisticUser: MessageRow = { role: 'user', content: text }
    const pendingAssistant: MessageRow = { role: 'assistant', content: '', pending: true, steps: [] }
    setMessages(prev => [...prev, optimisticUser, pendingAssistant])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const pageContext = collectPageContext(pathname || window.location.pathname)
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          chat_id: activeChatId,
          message: text,
          provider: selectedProvider || undefined,
          page_context: pageContext,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'chat' && ev.data?.id && !activeChatId) {
              setActiveChatId(ev.data.id)
            } else if (ev.type === 'text') {
              if (typeof ev.data === 'string' && ev.data.length > 0) {
                assistantText = assistantText ? assistantText + '\n\n' + ev.data : ev.data
                // Strip any <suggestions> block from the displayed text so it
                // doesn't flash in mid-stream. The final cleanup at stream-end
                // also strips it but we don't want it visible even for a moment.
                const visible = assistantText
                  .replace(/<suggestions>[\s\S]*?<\/suggestions>/gi, '')
                  .replace(/<suggestions>[\s\S]*$/gi, '')
                  .trimEnd()
                setMessages(prev => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last?.pending) copy[copy.length - 1] = { ...last, content: visible }
                  return copy
                })
              }
            } else if (ev.type === 'tool_call') {
              const step: ThoughtStep = {
                kind: 'tool_call',
                name: ev.data.name,
                args: ev.data.args,
                at: Date.now(),
              }
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.pending) copy[copy.length - 1] = { ...last, steps: [...(last.steps || []), step] }
                return copy
              })
            } else if (ev.type === 'tool_result') {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.pending) {
                  const steps = [...(last.steps || [])]
                  for (let i = steps.length - 1; i >= 0; i--) {
                    if (steps[i].kind === 'tool_call' && steps[i].name === ev.data.name && !steps[i].result) {
                      steps[i] = { ...steps[i], result: ev.data.result }
                      break
                    }
                  }
                  copy[copy.length - 1] = { ...last, steps }
                }
                return copy
              })
              // If the tool returned a _ui_action, run it in the real DOM.
              try {
                const parsed = JSON.parse(ev.data.result)
                if (parsed?._ui_action && typeof parsed._ui_action.type === 'string') {
                  dispatchUiAction(parsed._ui_action as UiAction)
                }
              } catch {}
            } else if (ev.type === 'error') {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.pending) copy[copy.length - 1] = { ...last, pending: false, content: `⚠️ ${ev.data}` }
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
          const { clean, suggestions } = extractSuggestions(assistantText || 'Done.')
          // The model is supposed to ALWAYS emit a <suggestions> block but it
          // sometimes skips — build contextual chips from the text itself so
          // the user always has useful follow-ups (never a dead end).
          const final = suggestions && suggestions.length > 0
            ? suggestions
            : buildFallbackSuggestions(clean, text)
          copy[copy.length - 1] = { ...last, pending: false, content: clean || 'Done.', suggestions: final }
        }
        return copy
      })
      loadChats()
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setMessages(prev => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last?.pending) copy[copy.length - 1] = { ...last, pending: false, content: `⚠️ ${err instanceof Error ? err.message : String(err)}` }
          return copy
        })
      }
    } finally {
      setSending(false)
      abortRef.current = null
      // Refocus so the user can keep typing without reaching for the mouse.
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }

  const toggleStep = (key: string) => setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }))

  const skillsByCategory: Record<string, Skill[]> = {}
  for (const s of skills) (skillsByCategory[s.category] ||= []).push(s)

  return (
    <>
      {/* Slim edge tab — sticks out from the right side. Clicking slides the
          panel in and pushes page content leftwards via --ai-panel-width. */}
      {!open && <button
        onClick={() => setOpen(true)}
        className="group fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 py-5 pl-2 pr-1.5 rounded-l-2xl bg-[#0A52EF] text-white shadow-[0_8px_24px_-8px_rgba(10,82,239,0.55)] hover:pr-2.5 hover:bg-[#0840C0] transition-[padding,background-color] duration-200"
        aria-label="Open ANC assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] [writing-mode:vertical-rl] rotate-180">
          AI
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-70 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>}

      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 bg-white border-l border-[#E8E8E8] shadow-2xl flex flex-col ai-panel-slide"
          style={{ width: `min(100vw, ${width}px)` }}
        >
          {/* Resize handle — drag the left edge to make the panel wider. */}
          <div
            onMouseDown={(e) => { e.preventDefault(); setResizing(true) }}
            className={`hidden sm:block absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-[#0A52EF]/20 ${resizing ? 'bg-[#0A52EF]/30' : ''}`}
            title="Drag to resize"
          />
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0A52EF]">ANC Assistant</span>
              {activeChatId ? (
                <span className="text-xs text-zinc-500 truncate">{chats.find(c => c.id === activeChatId)?.title || 'Chat'}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={newChat} title="New chat" className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={() => setHistoryOpen(v => !v)} title="History" className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <button onClick={() => setShowSkills(v => !v)} title="Skills" className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </button>
              <button onClick={() => setOpen(false)} title="Close" className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600">
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
                  <button onClick={() => deleteChat(c.id)} className="text-zinc-400 hover:text-red-600 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {showSkills && (
            <div className="border-b border-[#E8E8E8] bg-zinc-50/60 max-h-72 overflow-y-auto p-3 space-y-3">
              <div className="text-[11px] text-zinc-500">
                <strong>{skills.length}</strong> skills available to you
              </div>
              {Object.keys(skillsByCategory).sort().map(cat => (
                <div key={cat}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1">{cat}</div>
                  <div className="space-y-0.5">
                    {skillsByCategory[cat].map(s => (
                      <div key={s.name} className="flex items-start gap-2 text-xs text-zinc-600 px-2 py-1 rounded hover:bg-white">
                        <span className="text-sm">{s.icon}</span>
                        <div className="min-w-0">
                          <div className="font-mono font-medium text-zinc-800 truncate">{s.name}</div>
                          <div className="text-zinc-500 truncate">{s.description}</div>
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
              <div className="text-center text-sm text-zinc-500 mt-12 px-2">
                <div className="text-3xl mb-2">👋</div>
                <div className="text-zinc-600 font-medium">ANC Assistant</div>
                <div className="text-zinc-400 text-xs mt-1">Ask, click, or pick a suggestion.</div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-5">
                  {DEFAULT_SUGGESTIONS.map((s, i) => (
                    <button key={i}
                      onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 30) }}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-[#E8E8E8] bg-white text-zinc-600 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.filter(m => m.role !== 'tool' && m.role !== 'system').map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words bg-[#0A52EF] text-white">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] w-full">
                    {(m.steps || []).length > 0 && (
                      <div className="relative pl-5 border-l-2 border-zinc-200 space-y-2.5 mb-2">
                        {(m.steps || []).map((step, si) => {
                          const key = `${i}-${si}`
                          const expanded = !!expandedSteps[key]
                          const running = !step.result
                          return (
                            <div key={si} className="relative">
                              <div className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${running ? 'bg-[#0A52EF] text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
                                {running ? '·' : '✓'}
                              </div>
                              <button
                                onClick={() => toggleStep(key)}
                                className="text-left block w-full group"
                              >
                                <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-[0.12em]">
                                  {running ? 'Running' : 'Ran tool'}
                                </div>
                                <div className="text-xs text-zinc-800 font-mono group-hover:text-[#0A52EF] flex items-center gap-1.5">
                                  <span>{step.name}</span>
                                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </div>
                              </button>
                              {expanded && (
                                <div className="mt-1 rounded-lg border border-[#E8E8E8] bg-zinc-50 px-3 py-2 font-mono text-[11px] space-y-1">
                                  {step.args ? (
                                    <div>
                                      <div className="text-zinc-400 text-[10px] uppercase tracking-wider">Args</div>
                                      <div className="text-zinc-700 break-all">{step.args}</div>
                                    </div>
                                  ) : null}
                                  {step.result ? (
                                    <div>
                                      <div className="text-zinc-400 text-[10px] uppercase tracking-wider">Result</div>
                                      <div className="text-zinc-700 break-all max-h-40 overflow-y-auto">{step.result.length > 1200 ? step.result.slice(0, 1200) + '…' : step.result}</div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {m.content ? (
                      <>
                      <div className="rounded-2xl bg-zinc-100 text-zinc-800 px-4 py-2.5 text-sm break-words ai-prose">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: (p) => <h2 className="text-base font-semibold mt-2 mb-1 text-zinc-900" {...p} />,
                            h2: (p) => <h3 className="text-sm font-semibold mt-2 mb-1 text-zinc-900" {...p} />,
                            h3: (p) => <h4 className="text-sm font-semibold mt-1.5 mb-0.5 text-zinc-800" {...p} />,
                            p: (p) => <p className="my-1 leading-relaxed" {...p} />,
                            ul: (p) => <ul className="list-disc pl-5 my-1 space-y-0.5" {...p} />,
                            ol: (p) => <ol className="list-decimal pl-5 my-1 space-y-0.5" {...p} />,
                            li: (p) => <li className="my-0" {...p} />,
                            strong: (p) => <strong className="font-semibold text-zinc-900" {...p} />,
                            code: ({ children, ...rest }) => <code className="bg-white/70 border border-zinc-200 rounded px-1 py-0.5 text-[11px] font-mono" {...rest}>{children}</code>,
                            a: ({ href, children, ...rest }) => {
                              const isInternal = typeof href === 'string' && href.startsWith('/')
                              return isInternal ? (
                                <a
                                  href={href}
                                  onClick={(e) => { e.preventDefault(); if (href) router.push(href) }}
                                  className="inline-flex items-center gap-0.5 text-[#0A52EF] font-medium underline decoration-[#0A52EF]/30 underline-offset-2 hover:decoration-[#0A52EF] hover:bg-[#0A52EF]/5 px-0.5 rounded transition-colors"
                                  {...rest}
                                >
                                  {children}
                                </a>
                              ) : (
                                <a href={href} className="text-[#0A52EF] underline" target="_blank" rel="noopener noreferrer" {...rest}>
                                  {children}
                                </a>
                              )
                            },
                            table: (p) => <div className="my-2 overflow-x-auto"><table className="text-[12px] border-collapse w-full" {...p} /></div>,
                            thead: (p) => <thead className="bg-zinc-200/60" {...p} />,
                            th: (p) => <th className="border border-zinc-300 px-2 py-1 text-left font-semibold" {...p} />,
                            td: (p) => <td className="border border-zinc-300 px-2 py-1 align-top" {...p} />,
                            hr: () => <hr className="my-2 border-zinc-300" />,
                          }}
                        >
                          {normalizeMarkdownTables(m.content)}
                        </ReactMarkdown>
                      </div>
                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {m.suggestions.map((s, si) => (
                            <button key={si}
                              onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 30) }}
                              className="text-[11px] px-2.5 py-1 rounded-full border border-[#E8E8E8] bg-white text-zinc-600 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      </>
                    ) : m.pending ? (
                      <div className="rounded-2xl bg-zinc-100 text-zinc-400 px-4 py-2.5 text-sm italic">Thinking…</div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#E8E8E8] space-y-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask, search, or make anything…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-[#E8E8E8] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 max-h-32"
              />
              {sending ? (
                <button onClick={stop} className="rounded-xl bg-red-50 text-red-600 border border-red-200 px-3 py-2 text-sm font-medium hover:bg-red-100" title="Stop">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              ) : (
                <button onClick={send} disabled={!input.trim()}
                  className="rounded-xl bg-[#0A52EF] text-white px-3 py-2 text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 disabled:cursor-not-allowed">
                  Send
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{skills.length} skills loaded</span>
              {providers.length > 0 && (
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  className="text-[11px] text-zinc-600 bg-transparent border-0 focus:outline-none cursor-pointer"
                  title="AI provider"
                  disabled={sending}
                >
                  {providers.map(p => <option key={p.name} value={p.name}>{p.model} ({p.name})</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
