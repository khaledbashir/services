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
    icon: '💰',
    label: 'Where can ANC grow revenue?',
    prompt: 'Run a sales-growth audit on ANC. Surface the top revenue-expansion plays: uncovered venues to pitch service contracts to, ticket-pain venues that are upsell-ready, high-event venues without Event Support coverage, and dormant design requests that could become Content Subscriptions. For each play, estimate $ ARR opportunity. End with the single move ANC leadership should action this week. Build a dashboard.',
  },
  {
    icon: '🏟️',
    label: 'Uncovered-venue opportunity map',
    prompt: 'List the venues with NO Tech Support / White Glove LED Maintenance / Event Support contracts but high event volume or open tickets. For each, recommend the right tier of service contract to pitch and rough monthly pricing using web-searched industry benchmarks. Build a dashboard showing the top 15 opportunities ranked by combined event load + ticket count.',
  },
  {
    icon: '📈',
    label: 'Pricing-power audit',
    prompt: 'Audit ANC\'s current contracted-service pricing against market rates. For each service (Tech Support, White Glove LED Maintenance, Event Support, Turnkey LED Maintenance, Walkthroughs, LiveSync, VisionStats, Parts), web-search what comparable LED / display service shops charge. Verdict per service: under / at / above market. End with the biggest underpriced service ANC could raise rates on. Cite sources.',
  },
  {
    icon: '🎨',
    label: 'Design pipeline revenue play',
    prompt: 'Audit the design-request pipeline. How many are dormant vs active? Which clients have submitted the most requests without follow-up? Recommend how ANC could package these into recurring Content Subscriptions (graphics, sponsor overlays, stat overlays) with realistic per-venue pricing. Estimate ARR potential at 10% and 25% close rates. Build a dashboard.',
  },
  {
    icon: '⚠️',
    label: 'Top 3 risks for ANC',
    prompt: 'Surface the top 3 financial or operational risks ANC faces right now from the live dashboard data. For each: the data point that flags it, the size of the exposure, and one concrete mitigation ANC leadership should put in place. Risks should be about ANC\'s business — staffing, ticket backlog, missed event coverage, client concentration. Be ruthless.',
  },
  {
    icon: '🤝',
    label: 'Vendor-cost audit (ANC\'s own bills)',
    prompt: 'ANC pays vendors for things like SaaS, cloud, parts, and outside services. Where might ANC be overspending? Web-search market rates for the categories ANC consumes (event ticketing data, display parts, software platforms, etc.) and flag any line items that look high. This is about ANC\'s own vendor relationships — not about anyone billing ANC for services rendered.',
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
