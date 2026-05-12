'use client'

import { useEffect, useState } from 'react'

const ANYTHINGLLM_URL = 'https://abc-anything-llm.izcgmb.easypanel.host/workspace/anc-executive-advisor'

export default function ConsultantClient() {
  const [reloadKey, setReloadKey] = useState(0)

  // Push ANC data into the workspace as a pinned document on every mount so
  // the model has fresh numbers without the user lifting a finger. Best-effort
  // — failures are silent, the iframe still loads.
  useEffect(() => {
    fetch('/api/consultant/refresh-context', { method: 'POST', cache: 'no-store' }).catch(() => {})
  }, [])

  return (
    <div className="w-full h-[calc(100vh-40px)] flex flex-col">
      {/* Slim header strip — stays consistent with the rest of the suite */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl">🧭</span>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Advisor</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
              Executive AI counsel grounded in live ANC data + web search · type <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">@agent</code> on any message to force web search
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetch('/api/consultant/refresh-context', { method: 'POST', cache: 'no-store' }).catch(() => {})
              setReloadKey((k) => k + 1)
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
            title="Refresh ANC data context + reload the chat"
          >
            ↻ Sync data
          </button>
          <a
            href={ANYTHINGLLM_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
          >
            Pop out ↗
          </a>
        </div>
      </div>

      <iframe
        key={reloadKey}
        src={ANYTHINGLLM_URL}
        title="ANC Executive Advisor"
        className="flex-1 w-full border-0"
        allow="microphone; clipboard-write"
      />
    </div>
  )
}
