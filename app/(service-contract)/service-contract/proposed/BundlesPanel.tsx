'use client'

import { BUNDLES, TIER_BY_KEY, OPERATOR_BY_KEY, fmtUSD, type BundleKey } from './catalog-data'

interface Props {
  selected: BundleKey | null
  onSelect: (key: BundleKey | null) => void
}

export default function BundlesPanel({ selected, onSelect }: Props) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Bundles</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Annual bundles combine monthly support capacity with operator enablement.
          Larger commitments reduce approval overhead and make support costs easier to forecast.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {BUNDLES.map(bundle => {
          const isSelected = selected === bundle.key
          const isBest = bundle.key === 'c'
          const tier = TIER_BY_KEY[bundle.tier]
          const operator = bundle.operator ? OPERATOR_BY_KEY[bundle.operator] : null

          return (
            <div
              key={bundle.key}
              className={`relative rounded-2xl border-2 p-5 transition flex flex-col ${
                isSelected
                  ? 'border-[#0A52EF] bg-blue-50/40 dark:bg-blue-950/30 shadow-2xl ring-2 ring-[#0A52EF]/20 scale-[1.02]'
                  : isBest
                    ? 'border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 via-white to-blue-50/30 dark:from-emerald-950/40 dark:via-gray-900 dark:to-blue-950/20 shadow-xl'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
              }`}
            >
              {bundle.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-md whitespace-nowrap">
                  ⭐ {bundle.badge}
                </div>
              )}

              <div className="mb-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Bundle {bundle.key.toUpperCase()}</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{bundle.name}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{bundle.tagline}</p>
              </div>

              {/* Build-up */}
              <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1.5">
                <Line label={tier.name + ' retainer (12 mo)'} value={tier.annual} />
                {operator && <Line label={operator.name + (bundle.key === 'c' ? ' · included' : '')} value={operator.price} />}
                {bundle.saves > 0 && <Line label="Bundle discount" value={-bundle.saves} negative />}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">Year-1 total</span>
                  <span className="text-xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">{fmtUSD(bundle.bundlePrice)}</span>
                </div>
              </div>

              {bundle.saves > 0 && (
                <div className="mb-4 rounded-md bg-emerald-100 dark:bg-emerald-950/50 px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-700 dark:text-emerald-300">You save</div>
                  <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmtUSD(bundle.saves)}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">vs buying separately</div>
                </div>
              )}

              <ul className="space-y-1.5 mb-4 flex-1">
                {bundle.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onSelect(isSelected ? null : bundle.key)}
                className={`w-full px-3 py-2.5 rounded-md text-sm font-bold transition ${
                  isSelected
                    ? 'bg-[#0A52EF] text-white'
                    : isBest
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white hover:opacity-90 shadow-lg'
                      : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                }`}
              >
                {isSelected ? '✓ Selected' : isBest ? 'Select Best Value' : 'Select this bundle'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Line({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`font-semibold tabular-nums ${negative ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value < 0 ? '−' : ''}{fmtUSD(Math.abs(value))}
      </span>
    </div>
  )
}
