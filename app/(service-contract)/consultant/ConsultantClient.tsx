'use client'

import { useEffect, useState } from 'react'

const ANYTHINGLLM_URL = 'https://abc-anything-llm.izcgmb.easypanel.host/workspace/anc-executive-advisor'

interface AuditRecipe {
  icon: string
  label: string
  prompt: string
}

const AUDIT_RECIPES: AuditRecipe[] = [
  {
    icon: '✂️',
    label: 'Find $X/mo to cut',
    prompt: 'Plan an audit to find $500/mo of recurring SaaS spend to cut. For each top recurring vendor, weigh business value vs cost and benchmark against market alternatives via web search. Rank candidates by ease-of-cut and dollars saved. End with one specific cut to make this week.',
  },
  {
    icon: '🔍',
    label: 'Vendor benchmark sweep',
    prompt: 'Benchmark every recurring vendor in the ANC context against current market pricing. For each: (1) state what we pay, (2) web-search competitors and typical rates, (3) verdict: under / at / above market. Cite sources. End with the single biggest renegotiation lever.',
  },
  {
    icon: '⚠️',
    label: 'Top 3 risks this month',
    prompt: 'Audit the current ANC dashboard state and surface the top 3 financial or operational risks. For each: the data point that flags it, the size of the exposure, and one concrete mitigation. Be ruthless — no padding.',
  },
  {
    icon: '📈',
    label: 'Year-end projection',
    prompt: 'Project full-year SaaS + cloud spend at the current trailing-90-day run rate. Then build a scenario with realistic vendor consolidations (call out which) to lower it. Compare both numbers in a table and recommend the consolidations worth doing.',
  },
  {
    icon: '🎯',
    label: 'Where is the retainer leaking?',
    prompt: 'Audit the last 60 days of retainer-covered work. Which areas / requesters consume the most hours? Are any fixes repeating (same issue, multiple requests)? End with the structural change that would reduce monthly retainer burn by ~20%.',
  },
  {
    icon: '🤝',
    label: 'Change-order pricing audit',
    prompt: 'Audit the open change-order queue. For each item, sanity-check the quoted hours/price against the market rate for that scope via web search. Flag any quote that looks under-priced for ANC. End with a punch list of quotes to revise.',
  },
]

export default function ConsultantClient() {
  const [reloadKey, setReloadKey] = useState(0)
  const [recipesOpen, setRecipesOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Push ANC data into the workspace as a pinned document on every mount so
  // the model has fresh numbers without the user lifting a finger. Best-effort
  // — failures are silent, the iframe still loads.
  useEffect(() => {
    fetch('/api/consultant/refresh-context', { method: 'POST', cache: 'no-store' }).catch(() => {})
  }, [])

  async function copyRecipe(recipe: AuditRecipe) {
    try {
      await navigator.clipboard.writeText(recipe.prompt)
      setCopied(recipe.label)
      setTimeout(() => setCopied(null), 2500)
    } catch {
      // Fallback for browsers blocking clipboard — open a window with the text
      window.prompt('Copy this prompt:', recipe.prompt)
    }
  }

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
            onClick={() => setRecipesOpen((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              recipesOpen
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            📋 Audit recipes
          </button>
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

      {/* Audit recipes — click any card to copy the prompt, then paste it in the chat below */}
      {recipesOpen && (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Big-audit recipes · click any one to copy, paste in the chat
            </div>
            {copied && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                ✓ &ldquo;{copied}&rdquo; copied — paste it in the chat
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {AUDIT_RECIPES.map((r) => (
              <button
                key={r.label}
                onClick={() => copyRecipe(r)}
                className="text-left p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">{r.icon}</span>
                  <span className="font-semibold text-sm">{r.label}</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{r.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

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
