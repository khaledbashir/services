// Market-grounded estimator for NEW-work change orders.
//
// Every estimated number on the public transparency dashboard has to defend
// itself — Joe / Jireh / anyone else who clicks "why this many hours, why
// this $ amount" sees the chain that produced it: US market median →
// AI-assisted delivery efficiency → contract rate → long-term-partner
// adjustment → final ANC quote. No magic numbers, no AI hallucination, just a small
// curated table + transparent multipliers.
//
// Refresh the MARKET_TABLE quarterly against public sources.

export type WorkType =
  | 'new_feature_small'      // <1 day for a US senior — single field, single button, copy edit
  | 'new_feature_medium'     // 2-5 days — new view, new wizard step, modest workflow
  | 'new_feature_large'      // 1-3 weeks — multi-screen feature, cross-system flow
  | 'new_module'             // 1-2 weeks — new top-level section in an existing platform
  | 'new_dashboard'          // 4-10 days — new analytic surface with charts/aggregations
  | 'new_report'             // 2-5 days — Excel/PDF export with calculated columns
  | 'new_integration'        // 1-3 weeks — connect to a new external system / webhook
  | 'new_automation'         // 3-7 days — new scheduled job, hook, rule
  | 'data_migration'         // 1-3 weeks — move data between systems with validation
  | 'new_ai_agent'           // 1-2 weeks — new bot / agent / skill on existing AI surface
  | 'fix'                    // bug fix on already-shipped functionality (covered by retainer)

export type ScopeBand = 'low' | 'mid' | 'high'

export interface MarketReference {
  workType: WorkType
  label: string
  hours: { low: number; mid: number; high: number }
  hourlyRateUSD: { low: number; mid: number; high: number }
  sources: string[]   // citations — surfaced in the breakdown
}

// Sources cross-referenced 2026-05-07:
//
// 1. Upwork senior software developer hourly rate medians (US-based, $80-150/hr
//    for full-stack, $100-180/hr for specialists), public freelancer feed.
// 2. Toptal published rates for senior engineers (Tier 3): $100-200/hr,
//    listed at toptal.com/about/pricing.
// 3. Robert Half 2025 Salary Guide — senior software engineer median total comp
//    $150-180k → blended hourly equivalent ~$90-110/hr (loaded), $130-150/hr
//    (contractor markup).
// 4. Stack Overflow 2025 Developer Survey — full-stack senior median
//    $115k-145k US base, fewer benefits adjustments here.
//
// Hours bands derived from typical scoping benchmarks at agencies (Pivotal
// Labs estimation cards, Thoughtworks point sizing) for matching descriptions.
const MARKET_TABLE: MarketReference[] = [
  {
    workType: 'new_feature_small',
    label: 'Small feature (single field, button, or copy)',
    hours: { low: 4, mid: 6, high: 8 },
    hourlyRateUSD: { low: 95, mid: 120, high: 150 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate'],
  },
  {
    workType: 'new_feature_medium',
    label: 'Medium feature (new view, wizard step, workflow)',
    hours: { low: 16, mid: 28, high: 40 },
    hourlyRateUSD: { low: 100, mid: 130, high: 160 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate', 'Robert Half 2025 contractor band'],
  },
  {
    workType: 'new_feature_large',
    label: 'Large feature (multi-screen, cross-system flow)',
    hours: { low: 60, mid: 100, high: 160 },
    hourlyRateUSD: { low: 110, mid: 140, high: 175 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate', 'Robert Half 2025 contractor band'],
  },
  {
    workType: 'new_module',
    label: 'New top-level module inside an existing platform',
    hours: { low: 50, mid: 80, high: 130 },
    hourlyRateUSD: { low: 110, mid: 140, high: 175 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate'],
  },
  {
    workType: 'new_dashboard',
    label: 'New dashboard or analytic surface',
    hours: { low: 24, mid: 40, high: 70 },
    hourlyRateUSD: { low: 105, mid: 130, high: 160 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate'],
  },
  {
    workType: 'new_report',
    label: 'New report (Excel/PDF export with calculations)',
    hours: { low: 12, mid: 22, high: 36 },
    hourlyRateUSD: { low: 95, mid: 120, high: 150 },
    sources: ['Upwork senior median'],
  },
  {
    workType: 'new_integration',
    label: 'New integration (external API / webhook / vendor)',
    hours: { low: 40, mid: 70, high: 120 },
    hourlyRateUSD: { low: 110, mid: 145, high: 180 },
    sources: ['Upwork senior median', 'Toptal Tier 3 published rate', 'Robert Half 2025 contractor band'],
  },
  {
    workType: 'new_automation',
    label: 'New automation (scheduled job, hook, rule)',
    hours: { low: 16, mid: 28, high: 50 },
    hourlyRateUSD: { low: 100, mid: 130, high: 160 },
    sources: ['Upwork senior median'],
  },
  {
    workType: 'data_migration',
    label: 'Data migration with validation',
    hours: { low: 50, mid: 90, high: 160 },
    hourlyRateUSD: { low: 115, mid: 150, high: 185 },
    sources: ['Upwork senior median', 'Robert Half 2025 contractor band'],
  },
  {
    workType: 'new_ai_agent',
    label: 'New AI agent / bot / skill',
    hours: { low: 30, mid: 55, high: 100 },
    hourlyRateUSD: { low: 120, mid: 160, high: 200 },
    sources: ['Toptal AI engineer Tier 3 published rate', 'Upwork ML/AI senior median'],
  },
  {
    workType: 'fix',
    label: 'Bug fix on already-shipped functionality',
    hours: { low: 1, mid: 2.5, high: 5 },
    hourlyRateUSD: { low: 95, mid: 120, high: 150 },
    sources: ['Upwork senior median'],
  },
]

function getMarketRow(workType: WorkType): MarketReference {
  const row = MARKET_TABLE.find((m) => m.workType === workType)
  if (!row) throw new Error(`No market reference for workType=${workType}`)
  return row
}

// Discount chain — applied in order, transparently, with each step shown.

// AI-tooling + senior-operator efficiency. Senior dev with AI co-pilot
// (Claude / Cursor / Copilot) ships faster than the US senior baseline by
// ~30% on greenfield work, less on integration-heavy tasks. Anchored at
// 0.70x with a 0.05 jitter for risk-heavy categories.
const DELIVERY_EFFICIENCY_FACTOR: Record<WorkType, number> = {
  new_feature_small: 0.65,
  new_feature_medium: 0.70,
  new_feature_large: 0.75,
  new_module: 0.75,
  new_dashboard: 0.65,
  new_report: 0.60,
  new_integration: 0.80,    // less efficiency gain on external-API risk
  new_automation: 0.70,
  data_migration: 0.85,     // validation overhead doesn't compress
  new_ai_agent: 0.65,
  fix: 0.65,
}

// ANC contract overage rate from anc-service-contract-2026-04-30.pdf.
// All NEW-work quotes are derived from this rate × hours, never exposed
// hourly per the contract clause but used as the internal cost basis.
const CONTRACT_RATE_USD = 90

// Additional cushion for ongoing retainer partners — bakes in the
// "we're already on a $1,500/mo + 12hr cap" relationship goodwill into
// every NEW quote. 5% off the base.
const FRIENDLY_DISCOUNT = 0.05

export interface BreakdownStep {
  label: string
  hours?: number
  rateUSD?: number
  totalUSD?: number
  detail?: string
}

export interface MarketEstimate {
  workType: WorkType
  workTypeLabel: string
  scope: ScopeBand
  breakdown: BreakdownStep[]
  finalHours: number
  finalUSD: number
  sources: string[]
}

export function estimate(workType: WorkType, scope: ScopeBand = 'mid'): MarketEstimate {
  const row = getMarketRow(workType)
  const usHours = row.hours[scope]
  const usRate = row.hourlyRateUSD[scope]
  const usTotal = Math.round(usHours * usRate)

  const efficiencyFactor = DELIVERY_EFFICIENCY_FACTOR[workType]
  const opHours = Math.round(usHours * efficiencyFactor * 10) / 10  // 1 decimal
  const opTotalBeforeDiscount = Math.round(opHours * CONTRACT_RATE_USD)

  const friendlyTotal = Math.round(opTotalBeforeDiscount * (1 - FRIENDLY_DISCOUNT))

  const breakdown: BreakdownStep[] = [
    {
      label: `US market median — ${row.label} (${scope} band)`,
      hours: usHours,
      rateUSD: usRate,
      totalUSD: usTotal,
      detail: `Sourced from: ${row.sources.join(' · ')}`,
    },
    {
      label: 'AI-assisted delivery efficiency',
      hours: opHours,
      detail: `${Math.round((1 - efficiencyFactor) * 100)}% faster than a typical US baseline because the platform owner is using the existing codebase, context, and AI tooling.`,
    },
    {
      label: 'ANC contract overage rate',
      rateUSD: CONTRACT_RATE_USD,
      totalUSD: opTotalBeforeDiscount,
      detail: `$${CONTRACT_RATE_USD}/hr per the signed service contract (2026-04-30).`,
    },
    {
      label: 'Long-term partner adjustment',
      totalUSD: friendlyTotal,
      detail: `${Math.round(FRIENDLY_DISCOUNT * 100)}% off the rate-card price for ongoing retainer partners.`,
    },
  ]

  return {
    workType,
    workTypeLabel: row.label,
    scope,
    breakdown,
    finalHours: opHours,
    finalUSD: friendlyTotal,
    sources: row.sources,
  }
}

// Heuristic: pick a workType from the freeform request text. Falls back to
// new_feature_medium when nothing matches. Used by the triage flow when
// classification is NEW and we want a market-grounded estimate.
export function classifyWorkType(text: string): { workType: WorkType; scope: ScopeBand } {
  const t = (text || '').toLowerCase()

  // Order matters — more specific first
  if (/\b(migrat|migration|move data|backfill)/.test(t)) return { workType: 'data_migration', scope: 'mid' }
  if (/\b(integration|integrate|webhook|connect to|sync with|api with)/.test(t)) return { workType: 'new_integration', scope: 'mid' }
  if (/\b(dashboard|analytics|chart|kpi)/.test(t)) return { workType: 'new_dashboard', scope: 'mid' }
  if (/\b(report|export|excel|pdf|csv)/.test(t)) return { workType: 'new_report', scope: 'mid' }
  if (/\b(automation|cron|scheduled|recurring|every (day|hour|week))/.test(t)) return { workType: 'new_automation', scope: 'mid' }
  if (/\b(agent|skill|bot|chatbot|claude skill|slack bot)/.test(t)) return { workType: 'new_ai_agent', scope: 'mid' }
  if (/\b(module|new section|new tab|whole new)/.test(t)) return { workType: 'new_module', scope: 'mid' }

  // Size heuristic for generic "new feature" asks
  const small = /\b(field|button|copy|label|tweak|small|tiny|quick|trivial)/.test(t)
  const large = /\b(redesign|overhaul|multi-step|cross|complex|major|big|huge|whole flow|workflow)/.test(t)
  if (large) return { workType: 'new_feature_large', scope: 'mid' }
  if (small) return { workType: 'new_feature_small', scope: 'mid' }

  return { workType: 'new_feature_medium', scope: 'mid' }
}
