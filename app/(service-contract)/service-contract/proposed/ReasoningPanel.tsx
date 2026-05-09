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
