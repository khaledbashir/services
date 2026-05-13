'use client'

// Goblin Drawer — streams a plan-mode breakdown of a single proposed CO
// from the Advisor (AnythingLLM glm-5.1) so users can see exactly what it
// would take to ship the idea, grounded in ANC's live state.

import { useEffect, useRef, useState } from 'react'

interface ProposedCO {
  id: string
  name: string
  pitch: string | null
  bullets: string[]
  price_usd: number | null
  timeline_label: string | null
  benefit: string | null
  target_project: string | null
}

function renderMarkdown(text: string): string {
  if (!text) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = esc(text)
  html = html.replace(/```(?:[\w-]+)?\n([\s\S]*?)```/g, (_, c) => `<pre class="rounded-md bg-gray-100 dark:bg-gray-800 p-3 text-[11px] overflow-x-auto my-2"><code>${c.trim()}</code></pre>`)
  html = html.replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[12px]">$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">$1</a>')
  // Checkbox lines
  html = html.replace(/^(\s*)-\s*\[\s*\]\s*(.*)$/gm, '$1<div class="flex items-start gap-2 my-1"><span class="mt-0.5 inline-block w-3 h-3 rounded-sm border border-gray-400 dark:border-gray-600 shrink-0"></span><span>$2</span></div>')
  html = html.replace(/^(\s*)-\s*\[x\]\s*(.*)$/gmi, '$1<div class="flex items-start gap-2 my-1"><span class="mt-0.5 inline-block w-3 h-3 rounded-sm bg-emerald-500 shrink-0"></span><span class="text-gray-500 line-through">$2</span></div>')
  // Regular bullets
  html = html.replace(/(^|\n)(?:[-*]\s+.+(?:\n|$))+/g, (m) => {
    const items = m.trim().split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean)
    return '\n<ul class="list-disc pl-5 my-2 space-y-1">' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>'
  })
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-base font-bold mt-4 mb-2">$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
  html = html.split(/\n{2,}/).map((p) => /^<(h\d|ul|ol|pre|div)/.test(p.trim()) ? p : `<p class="my-1 leading-relaxed">${p.replace(/\n/g, '<br/>')}</p>`).join('\n')
  return html
}

function genUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export default function GoblinDrawer({ co, onClose }: { co: ProposedCO; onClose: () => void }) {
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller
    const sessionId = genUUID()

    const promptParts = [
      'Plan-mode breakdown for this proposed change order. Use ANC live operational context. Be specific with names and numbers from the pinned anc-live-context.md doc.',
      `**CO name:** ${co.name}`,
      co.pitch ? `**Pitch:** ${co.pitch}` : '',
      co.target_project ? `**Target platform:** ${co.target_project}` : '',
      co.price_usd ? `**Quoted price:** $${co.price_usd.toLocaleString('en-US')}` : '',
      co.timeline_label ? `**Timeline:** ${co.timeline_label}` : '',
      co.benefit ? `**Stated benefit:** ${co.benefit}` : '',
      co.bullets?.length ? `**Bullets:**\n${co.bullets.map((b) => `- ${b}`).join('\n')}` : '',
      '',
      'Output exactly this shape:',
      '1. **Plan** with 4-7 checkboxes (specific subtasks named in ANC verbs)',
      '2. **Step 1**, **Step 2**, … working each subtask with 2-3 lines of analysis grounded in actual ANC numbers/venues/staff/events',
      '3. **Bottom line** — 2-3 sentences: what ANC gets, what it costs, what to action next',
      '',
      'Do not address the user. Speak about ANC in third person.',
    ].filter(Boolean).join('\n')

    fetch('/api/consultant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: promptParts, sessionId, useAgent: false }),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n').filter((l) => l.startsWith('data: '))
          for (const line of lines) {
            const payload = line.slice(6).trim()
            if (!payload) continue
            try {
              const obj = JSON.parse(payload)
              if (typeof obj.textResponse === 'string' && obj.textResponse) {
                acc += obj.textResponse
                // strip <think> tokens
                const clean = acc.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')
                setText(clean)
              }
            } catch {
              acc += payload
              setText(acc)
            }
          }
        }
      }
      setStreaming(false)
    }).catch((err) => {
      if (err.name === 'AbortError') return
      setError(err.message || 'breakdown failed')
      setStreaming(false)
    })

    return () => controller.abort()
  }, [co])

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white dark:bg-gray-950 shadow-2xl flex flex-col overflow-hidden border-l border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🧞</span>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Goblin breakdown · live from the advisor
              </div>
            </div>
            <h2 className="text-lg font-bold leading-tight truncate">{co.name}</h2>
            {co.pitch && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{co.pitch}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="text-sm text-rose-600 dark:text-rose-400 mb-3">{error}</div>}
          {!text && streaming && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Asking the advisor to plan this out…
            </div>
          )}
          {text && (
            <div
              className="text-sm leading-relaxed prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}
          {streaming && text && (
            <span className="inline-block w-1.5 h-3 ml-1 bg-current rounded-sm animate-pulse" />
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-3 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
          <span>{streaming ? 'streaming…' : 'complete'}</span>
          <span>Plan grounded in live ANC operational state</span>
        </div>
      </div>
    </div>
  )
}
