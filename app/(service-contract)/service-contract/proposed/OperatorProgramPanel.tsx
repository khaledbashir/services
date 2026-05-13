'use client'

import { OPERATOR_PROGRAM, fmtUSD, type OperatorKey } from './catalog-data'

interface Props {
  selected: OperatorKey | null
  onSelect: (key: OperatorKey | null) => void
}

export default function OperatorProgramPanel({ selected, onSelect }: Props) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Charlie&apos;s Operator Program</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Train Charlie to support — or fully operate — the platforms in-house.
          One-time investment, paid on completion. Bundle with a retainer for the best effective price.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>ℹ️</span>
          <span>Standalone prices below are firm. Bundle discounts apply on the retainer side — see the Bundles tab.</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {OPERATOR_PROGRAM.map(option => {
          const isSelected = selected === option.key
          const isFull = option.key === 'full'
          return (
            <div
              key={option.key}
              className={`relative rounded-2xl border-2 p-5 transition flex flex-col ${
                isSelected
                  ? 'border-[#0A52EF] bg-blue-50/40 dark:bg-blue-950/30 shadow-lg ring-2 ring-[#0A52EF]/20'
                  : isFull
                    ? 'border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-gray-900'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
              }`}
            >
              {isFull && (
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest">
                  Full Transfer
                </div>
              )}

              <div className="mb-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">{option.tagline}</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{option.name}</h3>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-gray-100">{fmtUSD(option.price)}</span>
                  <span className="text-sm text-gray-500">one-time</span>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">{option.description}</p>

              <div className="mb-4 flex-1">
                <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">Includes</div>
                <ul className="space-y-1.5">
                  {option.includes.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300">
                      <span className="text-emerald-500 flex-shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {option.excludes && option.excludes.length > 0 && (
                <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5 font-semibold">Not included</div>
                  <ul className="space-y-1">
                    {option.excludes.map((item, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-gray-500">
                        <span className="flex-shrink-0">—</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={() => onSelect(isSelected ? null : option.key)}
                className={`w-full px-3 py-2 rounded-md text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-[#0A52EF] text-white'
                    : isFull
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                }`}
              >
                {isSelected ? '✓ Selected' : 'Add to selection'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
