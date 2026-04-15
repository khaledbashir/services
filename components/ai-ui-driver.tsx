'use client'

// Client-side executor for the AI agent's ui_* skills.
// Listens on a window event ("anc:ai-ui") and performs the action in the
// real DOM with a visible cursor that slides to the target. Shared event
// bus so the AiAssistant can fire actions from anywhere.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type UiAction =
  | { type: 'navigate'; path: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'select'; selector: string; value: string }
  | { type: 'highlight'; selector: string; label?: string }
  | { type: 'wait'; ms: number }
  | { type: 'toast'; message: string; variant?: 'info' | 'success' | 'warning' }

export function dispatchUiAction(action: UiAction) {
  window.dispatchEvent(new CustomEvent<UiAction>('anc:ai-ui', { detail: action }))
}

// Resolve an element by CSS selector OR visible text of a button/link.
function findElement(selector: string): HTMLElement | null {
  try {
    const direct = document.querySelector<HTMLElement>(selector)
    if (direct) return direct
  } catch {}
  const lower = selector.toLowerCase().trim()
  // Match button/link/label by visible text
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"], label, [data-ai-target]'))
  for (const el of candidates) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase()
    if (text === lower) return el
  }
  for (const el of candidates) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase()
    if (text.includes(lower)) return el
  }
  return null
}

function findField(selector: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  try {
    const direct = document.querySelector<Element>(selector)
    if (direct && (direct instanceof HTMLInputElement || direct instanceof HTMLTextAreaElement || direct instanceof HTMLSelectElement)) {
      return direct
    }
  } catch {}
  // Try label → for= → input lookup
  const lower = selector.toLowerCase().trim()
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  for (const lab of labels) {
    if ((lab.innerText || '').toLowerCase().trim().includes(lower)) {
      const forAttr = lab.getAttribute('for')
      if (forAttr) {
        const byId = document.getElementById(forAttr)
        if (byId && (byId instanceof HTMLInputElement || byId instanceof HTMLTextAreaElement || byId instanceof HTMLSelectElement)) return byId
      }
      const sibling = lab.parentElement?.querySelector('input, textarea, select')
      if (sibling) return sibling as HTMLInputElement
    }
  }
  return null
}

export function AiUiDriver() {
  const router = useRouter()
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; variant: string }>>([])
  const toastIdRef = useRef(0)

  const moveCursor = async (el: HTMLElement) => {
    const cursor = cursorRef.current
    if (!cursor) return
    const rect = el.getBoundingClientRect()
    const targetX = rect.left + rect.width / 2
    const targetY = rect.top + rect.height / 2
    cursor.style.opacity = '1'
    cursor.style.left = `${targetX}px`
    cursor.style.top = `${targetY}px`
    // Wait for the CSS transition (300ms + buffer).
    await new Promise((resolve) => setTimeout(resolve, 360))
  }

  const flashCursor = () => {
    const cursor = cursorRef.current
    if (!cursor) return
    cursor.classList.add('ai-cursor-click')
    setTimeout(() => cursor?.classList.remove('ai-cursor-click'), 400)
  }

  const ringFlash = (el: HTMLElement, label?: string) => {
    const rect = el.getBoundingClientRect()
    const ring = document.createElement('div')
    ring.className = 'ai-ring-flash'
    ring.style.left = `${rect.left - 6}px`
    ring.style.top = `${rect.top - 6}px`
    ring.style.width = `${rect.width + 12}px`
    ring.style.height = `${rect.height + 12}px`
    if (label) {
      const tag = document.createElement('div')
      tag.className = 'ai-ring-label'
      tag.textContent = label
      ring.appendChild(tag)
    }
    document.body.appendChild(ring)
    setTimeout(() => ring.remove(), 1800)
  }

  const typeIntoField = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.focus()
    // Clear existing
    const nativeSetter =
      el instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (nativeSetter) nativeSetter.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))

    let acc = ''
    for (const ch of value) {
      acc += ch
      if (nativeSetter) nativeSetter.call(el, acc)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 18))
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  useEffect(() => {
    const handler = async (e: Event) => {
      const action = (e as CustomEvent<UiAction>).detail
      if (!action) return
      try {
        switch (action.type) {
          case 'navigate': {
            router.push(action.path)
            await new Promise((r) => setTimeout(r, 500))
            break
          }
          case 'click': {
            const el = findElement(action.selector)
            if (!el) { console.warn('ai-ui: click target not found', action.selector); break }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            await new Promise((r) => setTimeout(r, 200))
            await moveCursor(el)
            flashCursor()
            el.click()
            break
          }
          case 'fill': {
            const el = findField(action.selector)
            if (!el) { console.warn('ai-ui: fill target not found', action.selector); break }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            await new Promise((r) => setTimeout(r, 150))
            await moveCursor(el)
            flashCursor()
            if (el instanceof HTMLSelectElement) {
              el.value = action.value
              el.dispatchEvent(new Event('change', { bubbles: true }))
            } else {
              await typeIntoField(el, action.value)
            }
            break
          }
          case 'select': {
            const el = findField(action.selector)
            if (!el) { console.warn('ai-ui: select target not found', action.selector); break }
            await moveCursor(el)
            flashCursor()
            if (el instanceof HTMLSelectElement) {
              // Match by value or by label text
              let found = Array.from(el.options).find(o => o.value === action.value)
              if (!found) found = Array.from(el.options).find(o => (o.textContent || '').trim().toLowerCase() === action.value.toLowerCase())
              if (found) {
                el.value = found.value
                el.dispatchEvent(new Event('change', { bubbles: true }))
              }
            }
            break
          }
          case 'highlight': {
            const el = findElement(action.selector)
            if (!el) { console.warn('ai-ui: highlight target not found', action.selector); break }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            await new Promise((r) => setTimeout(r, 200))
            ringFlash(el, action.label)
            break
          }
          case 'wait': {
            await new Promise((r) => setTimeout(r, action.ms || 800))
            break
          }
          case 'toast': {
            const id = ++toastIdRef.current
            setToasts((prev) => [...prev, { id, message: action.message, variant: action.variant || 'info' }])
            setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800)
            break
          }
        }
      } catch (err) {
        console.error('ai-ui action failed:', err)
      }
    }
    window.addEventListener('anc:ai-ui', handler as EventListener)
    return () => window.removeEventListener('anc:ai-ui', handler as EventListener)
  }, [router])

  return (
    <>
      {/* Floating AI cursor */}
      <div
        ref={cursorRef}
        className="ai-cursor"
        aria-hidden="true"
      />

      {/* Floating toasts (top-right, stacked) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg border max-w-sm animate-in fade-in slide-in-from-top-2 ${
              t.variant === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              t.variant === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-white text-zinc-800 border-[#E8E8E8]'
            }`}>
            {t.message}
          </div>
        ))}
      </div>

      <style jsx global>{`
        .ai-cursor {
          position: fixed;
          top: -100px;
          left: -100px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(10, 82, 239, 0.75);
          border: 2px solid #ffffff;
          box-shadow: 0 0 0 4px rgba(10, 82, 239, 0.2), 0 4px 14px rgba(10, 82, 239, 0.35);
          pointer-events: none;
          z-index: 9999;
          opacity: 0;
          transform: translate(-50%, -50%);
          transition: left 300ms cubic-bezier(0.4, 0, 0.2, 1),
                      top 300ms cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 200ms ease-out;
        }
        .ai-cursor.ai-cursor-click {
          animation: ai-cursor-pulse 400ms ease-out;
        }
        @keyframes ai-cursor-pulse {
          0% { box-shadow: 0 0 0 4px rgba(10, 82, 239, 0.2), 0 4px 14px rgba(10, 82, 239, 0.35); }
          50% { box-shadow: 0 0 0 18px rgba(10, 82, 239, 0), 0 4px 14px rgba(10, 82, 239, 0.35); }
          100% { box-shadow: 0 0 0 4px rgba(10, 82, 239, 0.2), 0 4px 14px rgba(10, 82, 239, 0.35); }
        }
        .ai-ring-flash {
          position: fixed;
          border: 2px solid #0A52EF;
          border-radius: 12px;
          pointer-events: none;
          z-index: 9998;
          animation: ai-ring-pulse 1.8s ease-out forwards;
        }
        @keyframes ai-ring-pulse {
          0% { box-shadow: 0 0 0 0 rgba(10, 82, 239, 0.55); opacity: 1; }
          60% { box-shadow: 0 0 0 14px rgba(10, 82, 239, 0); opacity: 0.85; }
          100% { opacity: 0; transform: scale(1.04); }
        }
        .ai-ring-label {
          position: absolute;
          top: -26px;
          left: 50%;
          transform: translateX(-50%);
          background: #0A52EF;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
          white-space: nowrap;
        }
      `}</style>
    </>
  )
}
