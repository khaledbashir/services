'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  reasoning: string
  status?: string | null
  busy?: boolean
  /** Also auto-scrolls the reasoning panel as new tokens arrive */
  autoScroll?: boolean
}

interface ModalProps extends Props {
  open: boolean
  onClose: () => void
}

/**
 * Modal-overlay version. Pops the moment a stream starts and stays open
 * until the user dismisses it. Same ReasoningPanel rendering inside.
 */
export function ReasoningModal({ open, onClose, reasoning, status, busy }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-white dark:bg-gray-950 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 border-b border-purple-200 dark:border-purple-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">🧠</span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-purple-900 dark:text-purple-100 leading-tight">
                AI is scoping your idea
              </div>
              <div className="text-[11px] text-purple-700 dark:text-purple-300 leading-tight">
                {busy ? (status || 'Reasoning live…') : 'Done — close this to see your draft below.'}
              </div>
            </div>
          </div>
          {busy ? (
            <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
          ) : (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ReasoningPanel reasoning={reasoning} status={null} busy={false} autoScroll={busy} />
        </div>
        {!busy && reasoning && (
          <div className="px-5 py-3 border-t border-purple-200 dark:border-purple-800/60 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold bg-[#0A52EF] hover:bg-[#0840C0] text-white rounded-md"
            >
              See the draft →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Renders the AI's chain-of-thought as live markdown. Used both as the
 * loading-state ("AI is thinking…") AND as the static accordion content
 * on the detail page. Same component, two contexts.
 */
export default function ReasoningPanel({ reasoning, status, busy, autoScroll = true }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [reasoning, autoScroll])

  return (
    <div className="rounded-xl border-2 border-purple-200 dark:border-purple-800/60 bg-white dark:bg-gray-950 overflow-hidden">
      {(busy || status) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-800/60">
          {busy && (
            <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          )}
          <span className="text-xs font-semibold text-purple-900 dark:text-purple-100">
            {status || 'AI reasoning…'}
          </span>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`px-4 py-3 prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0 prose-ul:my-2 prose-headings:mt-3 prose-headings:mb-1.5 prose-strong:font-semibold ${busy ? 'max-h-72 overflow-y-auto' : 'max-h-none'}`}
      >
        {reasoning ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {reasoning}
          </ReactMarkdown>
        ) : (
          <div className="text-xs text-gray-400 italic">{busy ? 'Waiting for the model to start thinking…' : 'No reasoning trace.'}</div>
        )}
      </div>
    </div>
  )
}
