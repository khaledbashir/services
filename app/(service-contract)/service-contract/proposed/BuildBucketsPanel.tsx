'use client'

import { BUILD_BUCKETS, HISTORY_STATS, type BucketKey } from './catalog-data'

const ACCENT_BY_KEY: Record<BucketKey, { ring: string; bg: string; chip: string }> = {
  xs: { ring: 'border-slate-300 dark:border-slate-700',     bg: 'bg-slate-50 dark:bg-slate-900/40',    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  s:  { ring: 'border-blue-300 dark:border-blue-800',       bg: 'bg-blue-50/60 dark:bg-blue-950/30',    chip: 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100' },
  m:  { ring: 'border-indigo-300 dark:border-indigo-800',   bg: 'bg-indigo-50/60 dark:bg-indigo-950/30', chip: 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100' },
  l:  { ring: 'border-purple-300 dark:border-purple-800',   bg: 'bg-purple-50/60 dark:bg-purple-950/30', chip: 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-100' },
  xl: { ring: 'border-amber-300 dark:border-amber-800',     bg: 'bg-amber-50/60 dark:bg-amber-950/30',   chip: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100' },
}

export default function BuildBucketsPanel() {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Build Catalog</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Every new feature lands in one of five buckets with a fixed price.
          XS through L can be approved from the catalog. Only XL needs a full phase scope.
        </p>
      </div>

      {/* Real-history snapshot */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/20 dark:to-gray-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Based on real history</span>
          <span className="text-[10px] text-gray-500">{HISTORY_STATS.windowLabel}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Total commits" value={HISTORY_STATS.totalCommits.toLocaleString('en-US')} />
          <Stat label="New features / mo" value={`~${HISTORY_STATS.newFeaturesPerMonthAvg}`} />
          <Stat label="Ships / mo" value={`~${HISTORY_STATS.shipsPerMonthAvg}`} />
          <Stat label="Distinct feature areas" value={HISTORY_STATS.distinctFeatureAreas.toString()} />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {(Object.entries(HISTORY_STATS.bucketDistribution) as [BucketKey, number][]).map(([k, pct]) => (
            <div key={k} className="text-center">
              <div className={`h-2 rounded-full ${ACCENT_BY_KEY[k].chip}`} style={{ opacity: 0.6 + (pct / 100) }} />
              <div className="text-[10px] text-gray-500 mt-1 uppercase">{k}</div>
              <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{pct}%</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 italic">
          Distribution of last 6 months of shipped work. Operator+ retainer&apos;s 12h build credits absorb the entire XS/S layer plus most M&apos;s — only L and XL trigger a separate invoice.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 md:grid-cols-2 gap-3">
        {BUILD_BUCKETS.map(bucket => {
          const accent = ACCENT_BY_KEY[bucket.key]
          return (
            <div
              key={bucket.key}
              className={`rounded-xl border-2 ${accent.ring} ${accent.bg} p-4 flex flex-col gap-3`}
            >
              <div>
                <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${accent.chip}`}>
                  {bucket.hoursRange}
                </div>
                <h3 className="text-base font-bold mt-2 text-gray-900 dark:text-gray-100">{bucket.name}</h3>
                <div className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">{bucket.priceLabel}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 mb-1">Fits</div>
                <ul className="space-y-0.5">
                  {bucket.fits.map((f, i) => (
                    <li key={i} className="text-[11px] text-gray-700 dark:text-gray-300 flex gap-1.5">
                      <span className="text-gray-400">·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 mb-1">Real examples</div>
                <ul className="space-y-0.5">
                  {bucket.examples.map((e, i) => (
                    <li key={i} className="text-[10px] text-gray-500 dark:text-gray-400 italic line-clamp-1">{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 bg-gray-50/40 dark:bg-gray-900/40">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">How this simplifies approvals</div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          Today every new ask above a small tweak needs a custom scope and separate approval. Under this catalog,
          XS/S/M/L work can be approved from a standard bucket, keeping the larger phase documents for truly large builds.
        </p>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5 text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}
