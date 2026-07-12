'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { AiAssistant } from '@/components/ai-assistant'
import { AiUiDriver } from '@/components/ai-ui-driver'

// Operations Workspace = the ANC-branded NocoDB workspace, embedded full-bleed.
// The embed only works because our pinned NocoDB image neutralises the upstream
// anti-iframe guard (see anc-nocodb Dockerfile, 2026-06-23). If this ever shows
// "Not allowed", the NocoDB image regressed — re-check that patch, not this file.
const OPS_WORKSPACE_URL = 'https://ops.ancsports.net/#/w2116qsq'
const OPS_WORKSPACE_ORIGIN = 'https://ops.ancsports.net'

const OPERATOR_ACTIONS = [
  {
    label: 'Find a table',
    prompt: 'List the Operations bases and tables, then help me open the right table for the work I describe.',
  },
  {
    label: 'Review open work',
    prompt: 'Use the Operations tools to find open or in-progress operational records that need attention. Summarize the highest-priority items and offer to guide me to the relevant table or view.',
  },
  {
    label: 'Guide this workspace',
    prompt: 'Act as my visible Operations guide. Explain where to start, then use the Operations UI bridge to highlight or open the most relevant table or view. Use authenticated Operations tools for real record data or changes.',
  },
]

export default function OperationsPage() {
  const [bridgeReady, setBridgeReady] = useState(false)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== OPS_WORKSPACE_ORIGIN) return
      if (event.data?.type === 'anc:ai-ui-ready') setBridgeReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const askOperator = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('anc:ai-prompt', { detail: { prompt } }))
  }

  return (
    <DashboardLayout fullBleed>
      <div className="relative h-full w-full" data-ai-target="operations-workspace">
        <iframe
          src={OPS_WORKSPACE_URL}
          title="ANC Operations"
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
          data-ai-target="operations-iframe"
        />

        <div
          className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-5rem)] items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur"
          data-ai-target="operations-operator-bar"
          aria-label="Operations AI operator controls"
        >
          <div
            className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-zinc-700"
            data-ai-target="operations-ai-status"
          >
            <span className={`h-2 w-2 rounded-full ${bridgeReady ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            AI Operator
            <span className="hidden text-[10px] font-normal text-zinc-400 sm:inline">
              {bridgeReady ? 'visible controls connected' : 'data tools ready'}
            </span>
          </div>
          {OPERATOR_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => askOperator(action.prompt)}
              className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:block"
              data-ai-target={`operations-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <AiAssistant />
      <AiUiDriver />
    </DashboardLayout>
  )
}
