'use client'

import { SERVICE_TIERS, fmtUSD, type TierKey } from './catalog-data'

interface Props {
  selected: TierKey | null
  onSelect: (key: TierKey) => void
}

export default function ServiceTiersPanel({ selected, onSelect }: Props) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Monthly Service Tiers</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          The retainer covers fixes, maintenance, and operator support across all four platforms.
          Each step up improves the effective hourly rate — buy more hours, pay less per hour.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {SERVICE_TIERS.map(tier => {
          const isSelected = selected === tier.key
          const isRecommended = !!tier.recommended
          const savings = tier.effectiveRate < 125 ? 125 - tier.effectiveRate : 0
          return (
            <div
              key={tier.key}
              className={`relative rounded-2xl border-2 p-5 transition flex flex-col ${
                isSelected
                  ? 'border-[#0A52EF] bg-blue-50/40 dark:bg-blue-950/30 shadow-lg ring-2 ring-[#0A52EF]/20'
                  : isRecommended
                    ? 'border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-gray-900'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest">
                  Recommended
                </div>
              )}

              <div className="mb-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">{tier.tagline}</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tier.name}</h3>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-gray-100">{fmtUSD(tier.monthly)}</span>
                  <span className="text-sm text-gray-500">/mo</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{fmtUSD(tier.annual)} / year</div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2">
                  <div className="text-gray-500 mb-0.5">Hours / mo</div>
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100">{tier.hours}h</div>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2">
                  <div className="text-gray-500 mb-0.5">Effective rate</div>
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100">${tier.effectiveRate}/hr</div>
                </div>
              </div>

              {savings > 0 && (
                <div className="mb-3 rounded-md bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  Save ${savings}/hr vs Steady · ~{fmtUSD(savings * tier.hours)} better value/mo
                </div>
              )}

              <ul className="space-y-1.5 mb-4 flex-1">
                {tier.perks.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>

              <div className="text-[11px] text-gray-500 italic mb-3">{tier.best_for}</div>
              <div className="text-[11px] text-gray-500 mb-3">Response: {tier.responseSla}</div>

              <button
                onClick={() => onSelect(tier.key)}
                className={`w-full px-3 py-2 rounded-md text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-[#0A52EF] text-white'
                    : isRecommended
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                }`}
              >
                {isSelected ? '✓ Selected' : 'Select this tier'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
