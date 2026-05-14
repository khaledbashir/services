'use client'

import { useState } from 'react'
import PlanBuilderPanel from './PlanBuilderPanel'
import ServiceTiersPanel from './ServiceTiersPanel'
import OperatorProgramPanel from './OperatorProgramPanel'
import BuildBucketsPanel from './BuildBucketsPanel'
import BundlesPanel from './BundlesPanel'
import ForecastPanel from './ForecastPanel'
import {
  TIER_BY_KEY, OPERATOR_BY_KEY, BUNDLE_BY_KEY, fmtUSD,
  type TierKey, type OperatorKey, type BundleKey,
} from './catalog-data'

type TabKey = 'build' | 'tiers' | 'operator' | 'buckets' | 'bundles' | 'forecast' | 'explore'

// Custom Asks lives outside this list — it's promoted to a hero CTA above
// the tab strip so it stops getting buried.
const TABS: Array<{ key: TabKey; label: string; icon: string; hint: string }> = [
  { key: 'build',    label: 'Build Your Plan', icon: '🎮', hint: 'Slide hours, unlock perks' },
  { key: 'tiers',    label: 'Service Tiers',   icon: '🎯', hint: 'Monthly retainer ladder' },
  { key: 'operator', label: 'Operator Program', icon: '🧑‍💻', hint: 'Train Charlie' },
  { key: 'buckets',  label: 'Build Catalog',   icon: '📦', hint: 'Fixed-price buckets for new work' },
  { key: 'bundles',  label: 'Bundles',         icon: '🎁', hint: 'The deals — bundle savings' },
  { key: 'forecast', label: 'Annual Forecast', icon: '📈', hint: 'Predicted Year-1 spend' },
]

export default function CatalogTabs({ exploreContent }: { exploreContent: React.ReactNode }) {
  const [tab, setTab] = useState<TabKey>('build')
  const [tier, setTier] = useState<TierKey | null>(null)
  const [operator, setOperator] = useState<OperatorKey | null>(null)
  const [bundle, setBundle] = useState<BundleKey | null>(null)

  // When a bundle is picked, auto-set its constituent tier + operator for clarity.
  const pickBundle = (key: BundleKey | null) => {
    setBundle(key)
    if (key) {
      const b = BUNDLE_BY_KEY[key]
      setTier(b.tier)
      setOperator(b.operator)
    }
  }

  const tierObj = tier ? TIER_BY_KEY[tier] : null
  const operatorObj = operator ? OPERATOR_BY_KEY[operator] : null
  const bundleObj = bundle ? BUNDLE_BY_KEY[bundle] : null

  // Running total = bundle if selected (already discounted), otherwise tier annual + operator one-time.
  const yearOneTotal = bundleObj
    ? bundleObj.bundlePrice
    : (tierObj?.annual ?? 0) + (operatorObj?.price ?? 0)
  const recurringTotal = tierObj?.annual ?? 0

  const hasSelection = tier || operator || bundle

  return (
    <div className="mb-8">
      {/* Hero */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Catalog · build your service contract</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Pick the tier where you stop thinking about hours.</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-3xl">
          Monthly support, operator training, and per-bucket pricing for new builds — all in one catalog.
          Each step up cuts your effective hourly rate. Bundle to save another $6K–$18K.
        </p>
      </div>

      {/* Custom Asks — promoted hero CTA, was previously buried as the
          last tab. Clicking activates the explore panel below. */}
      <button
        onClick={() => setTab('explore')}
        className={`w-full text-left mb-4 rounded-2xl p-5 transition shadow-sm hover:shadow-lg group relative overflow-hidden ${
          tab === 'explore'
            ? 'bg-gradient-to-br from-[#0A52EF] via-violet-600 to-fuchsia-600 ring-2 ring-violet-400 dark:ring-violet-500'
            : 'bg-gradient-to-br from-[#0A52EF]/95 via-violet-600/95 to-fuchsia-600/95 hover:from-[#0A52EF] hover:via-violet-600 hover:to-fuchsia-600'
        }`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-white/15 px-2 py-0.5 rounded-full backdrop-blur-sm">
                ✨ AI · custom quote
              </span>
              {tab === 'explore' && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-white bg-emerald-500 px-2 py-0.5 rounded-full">
                  Open
                </span>
              )}
            </div>
            <div className="text-xl md:text-2xl font-bold text-white leading-tight">
              Don&apos;t see it? Ask for anything custom.
            </div>
            <div className="text-sm text-white/85 mt-0.5">
              Describe what you want — AI scopes it, prices it, and gives you a Year-1 path. Not limited to the catalog.
            </div>
          </div>
          <div className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-[#0A52EF] text-sm font-bold px-5 py-2.5 rounded-full shadow-md group-hover:scale-105 transition">
            {tab === 'explore' ? 'You are here ↓' : 'Start a custom ask →'}
          </div>
        </div>
        {/* decorative glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      </button>

      {/* Tab strip */}
      <div className="border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-3 text-sm font-semibold whitespace-nowrap transition border-b-2 ${
                tab === t.key
                  ? 'border-[#0A52EF] text-[#0A52EF] dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title={t.hint}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active panel */}
      <div className="mb-8">
        {tab === 'build'    && <PlanBuilderPanel />}
        {tab === 'tiers'    && <ServiceTiersPanel selected={tier} onSelect={setTier} />}
        {tab === 'operator' && <OperatorProgramPanel selected={operator} onSelect={setOperator} />}
        {tab === 'buckets'  && <BuildBucketsPanel />}
        {tab === 'bundles'  && <BundlesPanel selected={bundle} onSelect={pickBundle} />}
        {tab === 'forecast' && <ForecastPanel initialBundle={bundle ?? 'c'} />}
        {tab === 'explore'  && <div>{exploreContent}</div>}
      </div>

      {/* Sticky running-total bar — only when there's a selection */}
      {hasSelection && (
        <div className="sticky bottom-4 z-30 rounded-2xl border-2 border-[#0A52EF]/30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-2xl p-4 mt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Your selection</span>
              {bundleObj && (
                <Chip emoji="🎁" label={bundleObj.name} sub={fmtUSD(bundleObj.bundlePrice) + ' Y1'} />
              )}
              {!bundleObj && tierObj && (
                <Chip emoji="🎯" label={tierObj.name} sub={fmtUSD(tierObj.monthly) + '/mo'} />
              )}
              {!bundleObj && operatorObj && (
                <Chip emoji="🧑‍💻" label={operatorObj.name} sub={fmtUSD(operatorObj.price)} />
              )}
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Year-1</div>
                <div className="text-2xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">{fmtUSD(yearOneTotal)}</div>
              </div>
              {recurringTotal !== yearOneTotal && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Year 2+</div>
                  <div className="text-lg font-bold tabular-nums text-gray-600 dark:text-gray-400">{fmtUSD(recurringTotal)}/yr</div>
                </div>
              )}
              <button
                onClick={() => { setTier(null); setOperator(null); setBundle(null) }}
                className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 underline"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ emoji, label, sub }: { emoji: string; label: string; sub: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
      <span>{emoji}</span>
      <div className="leading-tight">
        <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{label}</div>
        <div className="text-[10px] text-gray-500">{sub}</div>
      </div>
    </div>
  )
}
