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
  | { type: 'fill_form'; assignments: Array<{ selector: string; value: string }>; only_if_empty?: boolean }
  | { type: 'fill'; selector: string; value: string; fast?: boolean }
  | { type: 'select'; selector: string; value: string }
  | { type: 'highlight'; selector: string; label?: string }
  | { type: 'wait'; ms: number }
  | { type: 'toast'; message: string; variant?: 'info' | 'success' | 'warning' }
  | { type: 'refresh' }
  | { type: 'sequence'; actions: UiAction[] }

export function dispatchUiAction(action: UiAction) {
  if (action.type === 'sequence') {
    let delay = 0
    for (const step of action.actions) {
      window.setTimeout(() => dispatchUiAction(step), delay)
      delay += step.type === 'wait'
        ? Math.max(100, step.ms)
        : step.type === 'refresh' || step.type === 'navigate'
          ? 750
          : step.type === 'fill'
            ? 900
            : 650
    }
    return
  }
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
  const bareTarget = selector.trim()
  if (bareTarget && !bareTarget.startsWith('#') && !bareTarget.startsWith('.') && !bareTarget.startsWith('[')) {
    const byAiTarget = document.querySelector<Element>(`[data-ai-target="${CSS.escape(bareTarget)}"]`)
    if (byAiTarget && (byAiTarget instanceof HTMLInputElement || byAiTarget instanceof HTMLTextAreaElement || byAiTarget instanceof HTMLSelectElement)) {
      return byAiTarget
    }
  }
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

function fieldCurrentValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el instanceof HTMLSelectElement) {
    const selected = el.selectedOptions?.[0]
    return (selected?.textContent || el.value || '').trim()
  }
  return (el.value || '').trim()
}

// Cross-origin iframe relay — the NocoDB iframe at nocodb.ancsports.net
// hosts a sibling listener (anc-overrides.js) that performs ui_* actions
// inside the iframe DOM and posts back results. We need this because
// browser security blocks the parent from touching cross-origin iframe
// DOM directly, so click/fill/highlight against NocoDB cells from the
// parent's findElement will always come up empty.
const OPS_IFRAME_ORIGIN = 'https://nocodb.ancsports.net'
const OPS_BRIDGE_TIMEOUT_MS = 5000

function findOpsIframe(): HTMLIFrameElement | null {
  const all = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[]
  return all.find((f) => {
    try {
      return new URL(f.src).origin === OPS_IFRAME_ORIGIN
    } catch {
      return false
    }
  }) || null
}

function isOpsRoute(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/operations')
}

// Send a UiAction to the NocoDB iframe and wait for the result. Resolves
// with `{ ok, value? }` on success, rejects with the iframe's error
// message on failure or after OPS_BRIDGE_TIMEOUT_MS without a reply.
async function sendToOpsIframe(action: UiAction): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  const iframe = findOpsIframe()
  if (!iframe || !iframe.contentWindow) {
    throw new Error('ops iframe not found — is the user on /operations?')
  }
  const requestId = `anc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== OPS_IFRAME_ORIGIN) return
      const data = ev.data
      if (!data || data.type !== 'anc:ai-ui-result' || data.requestId !== requestId) return
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      if (data.ok) resolve({ ok: true, value: data.value })
      else reject(new Error(data.error || 'iframe action failed'))
    }
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(`ops iframe did not reply within ${OPS_BRIDGE_TIMEOUT_MS}ms`))
    }, OPS_BRIDGE_TIMEOUT_MS)
    window.addEventListener('message', onMessage)
    iframe.contentWindow!.postMessage({ type: 'anc:ai-ui', requestId, action }, OPS_IFRAME_ORIGIN)
  })
}

export function AiUiDriver() {
  const router = useRouter()
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; variant: string }>>([])
  const toastIdRef = useRef(0)
  // Tracks whether the NocoDB iframe bridge has announced itself as ready.
  // On /operations we prefer the bridge for click/fill/highlight; if it's
  // not ready (iframe still loading or anc-overrides.js not yet fired its
  // anc:ai-ui-ready heartbeat), we fall back to the local DOM dispatch and
  // surface the same warnings as before.
  const opsBridgeReadyRef = useRef(false)

  // Listen for the bridge's heartbeat (sent on load + every hashchange in
  // the iframe). Cleared when the iframe goes away (route change off
  // /operations) so we don't trust a stale ready flag.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== OPS_IFRAME_ORIGIN) return
      if (ev.data?.type === 'anc:ai-ui-ready') opsBridgeReadyRef.current = true
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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

  const typeIntoField = async (el: HTMLInputElement | HTMLTextAreaElement, value: string, fast = false) => {
    el.focus()
    const nativeSetter =
      el instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

    // Fast path: long strings and bulk fills. Skip the typewriter and just
    // fire the controlled-input events so React state picks up the value.
    if (fast || value.length > 40) {
      if (nativeSetter) nativeSetter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('blur', { bubbles: true }))
      return
    }

    if (nativeSetter) nativeSetter.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    let acc = ''
    for (const ch of value) {
      acc += ch
      if (nativeSetter) nativeSetter.call(el, acc)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      // 8ms per char: a 30-char name now takes ~240ms instead of 540ms.
      await new Promise((resolve) => setTimeout(resolve, 8))
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  useEffect(() => {
    const handler = async (e: Event) => {
      const action = (e as CustomEvent<UiAction>).detail
      if (!action) return

      // On /operations, prefer the cross-origin iframe bridge for any
      // action that targets DOM (click / fill / highlight). Local
      // findElement() can't see into the iframe, so without this the
      // action falls through to a "target not found" warning while the
      // user stares at the NocoDB cell waiting for something to happen.
      // Navigate, fill_form, wait, toast, refresh stay on the parent —
      // those are dashboard-level concerns.
      const isDomAction = action.type === 'click' || action.type === 'fill' || action.type === 'highlight'
      if (isOpsRoute() && isDomAction) {
        try {
          await sendToOpsIframe(action)
          return
        } catch (err) {
          // Iframe bridge failed (not ready, timeout, or genuinely missing
          // selector inside the iframe). Fall through to the local DOM
          // dispatch — selector might still match something on the parent
          // chrome (e.g. the AI panel itself).
          console.warn('ai-ui: ops iframe relay failed, falling back to parent DOM:', err)
        }
      }

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
              await typeIntoField(el, action.value, action.fast)
            }
            break
          }
          case 'fill_form': {
            for (const assignment of action.assignments || []) {
              const selector = String(assignment?.selector || '')
              const value = String(assignment?.value || '')
              if (!selector) continue
              const el = findField(selector)
              if (!el) { console.warn('ai-ui: fill_form target not found', selector); continue }
              const current = fieldCurrentValue(el)
              if (action.only_if_empty && current) continue
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              await new Promise((r) => setTimeout(r, 100))
              await moveCursor(el)
              flashCursor()
              if (el instanceof HTMLSelectElement) {
                let found = Array.from(el.options).find(o => o.value === value)
                if (!found) found = Array.from(el.options).find(o => (o.textContent || '').trim().toLowerCase() === value.toLowerCase())
                if (found) {
                  el.value = found.value
                  el.dispatchEvent(new Event('change', { bubbles: true }))
                }
              } else {
                await typeIntoField(el, value, true)
              }
              await new Promise((r) => setTimeout(r, 60))
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
            await moveCursor(el)
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
          case 'refresh': {
            // Re-fetch server-component data AND notify client components that
            // own their own fetch state (they subscribe to `anc:data-refresh`).
            router.refresh()
            window.dispatchEvent(new Event('anc:data-refresh'))
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
