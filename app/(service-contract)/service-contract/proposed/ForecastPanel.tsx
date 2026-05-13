'use client'

import { useState } from 'react'
import { FORECAST_BY_BUNDLE, BUNDLES, BUNDLE_BY_KEY, fmtUSD, type BundleKey } from './catalog-data'

export default function ForecastPanel({ initialBundle = 'c' as BundleKey }) {
  const [active, setActive] = useState<BundleKey>(initialBundle)
  const bundle = BUNDLE_BY_KEY[active]
  const lines = FORECAST_BY_BUNDLE[active]
  const total = lines.reduce((sum, l) => sum + l.yearOneCost, 0)
  const recurring = lines.reduce((sum, l) => sum + l.recurring, 0)

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Annual Forecast</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Based on the last 6 months of pattern data — what ANC actually ships per month — here&apos;s the
          predicted Year-1 spend per bundle. The retainer absorbs most builds; only the bigger ones
          show up as separate bucket invoices.
        </p>
      </div>

      {/* Bundle switcher */}
      <div className="flex flex-wrap gap-2 mb-4">
        {BUNDLES.map(b => (
          <button
            key={b.key}
            onClick={() => setActive(b.key)}
            className={`px-3 py-1.5 text-xs rounded-md border transition ${
              active === b.key
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50/60 via-white to-emerald-50/40 dark:from-blue-950/30 dark:via-gray-900 dark:to-emerald-950/20">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{bundle.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{bundle.tagline}</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Predicted Year-1</div>
              <div className="text-3xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">{fmtUSD(total)}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Year 2+: {fmtUSD(recurring)} recurring</div>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              <th className="text-left text-[10px] uppercase tracking-widest font-bold text-gray-500 px-5 py-2">Line item</th>
              <th className="text-right text-[10px] uppercase tracking-widest font-bold text-gray-500 px-5 py-2">Year-1</th>
              <th className="text-right text-[10px] uppercase tracking-widest font-bold text-gray-500 px-5 py-2">Recurring</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-5 py-2.5 text-gray-700 dark:text-gray-300">{line.label}</td>
                <td className={`px-5 py-2.5 text-right tabular-nums font-semibold ${
                  line.yearOneCost === 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : line.yearOneCost < 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {line.yearOneCost === 0 ? 'included' : (line.yearOneCost < 0 ? '−' : '') + fmtUSD(Math.abs(line.yearOneCost))}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-gray-500">
                  {line.recurring === 0 ? '—' : fmtUSD(line.recurring)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
              <td className="px-5 py-3 font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-widest">Total</td>
              <td className="px-5 py-3 text-right tabular-nums text-xl font-extrabold text-gray-900 dark:text-gray-100">{fmtUSD(total)}</td>
              <td className="px-5 py-3 text-right tabular-nums text-sm font-semibold text-gray-700 dark:text-gray-300">{fmtUSD(recurring)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/40 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">The pitch line</div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            &ldquo;Stop guessing what builds cost. Here&apos;s the catalog. Here&apos;s the volume.
            Here&apos;s your number — predictable Year-1, predictable recurring.&rdquo;
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-2">Optional add-on</div>
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Build Credit Pack</div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
            Buy 30 build hours upfront for $4,500 (vs $250–$750/hr in buckets).
            Valid 6 months. Lock the rate, ship faster.
          </p>
        </div>
      </div>
    </section>
  )
}
