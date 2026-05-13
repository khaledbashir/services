'use client'

import { useMemo, useState } from 'react'
import { IDEA_SEEDS, BUILD_BUCKETS, type IdeaSeed } from './catalog-data'

const PLATFORM_LABEL: Record<string, { label: string; color: string }> = {
  'service-dashboard': { label: 'Service Dashboard', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  'crm':              { label: 'CRM',                color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'proposal-engine':  { label: 'Proposal Engine',    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  'docs':             { label: 'Operator Docs',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
}

const BUCKET_LOOKUP = Object.fromEntries(BUILD_BUCKETS.map(b => [b.key, b]))

interface Props {
  query: string
  onPick: (seed: IdeaSeed) => void
}

export default function IdeaSuggestions({ query, onPick }: Props) {
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return IDEA_SEEDS
    const scored = IDEA_SEEDS.map(s => {
      const text = `${s.title} ${s.description} ${s.keywords.join(' ')} ${s.platforms.join(' ')}`.toLowerCase()
      let score = 0
      const words = q.split(/\s+/).filter(Boolean)
      for (const w of words) {
        if (text.includes(w)) score += 1
        if (s.title.toLowerCase().includes(w)) score += 2
        if (s.keywords.some(k => k.toLowerCase() === w)) score += 3
      }
      return { seed: s, score }
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
    return scored.map(x => x.seed)
  }, [query])

  const visible = showAll ? filtered : filtered.slice(0, 6)
  const hidden = filtered.length - visible.length
  const isFiltered = query.trim().length > 0

  if (filtered.length === 0 && isFiltered) {
    return (
      <div className="text-xs text-gray-500 italic px-2 py-3">
        No starter ideas match — keep typing or hit Scope it to generate from scratch.
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">
            {isFiltered ? `${filtered.length} matching idea${filtered.length === 1 ? '' : 's'}` : 'Starter ideas — click one to fill the box'}
          </span>
          {isFiltered && (
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
              ✨ filtered by "{query.trim().slice(0, 40)}"
            </span>
          )}
        </div>
        {hidden > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            Show {hidden} more →
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {visible.map(seed => {
          const bucket = BUCKET_LOOKUP[seed.bucket]
          return (
            <button
              key={seed.id}
              type="button"
              onClick={() => onPick(seed)}
              className="group text-left rounded-lg border border-blue-200 dark:border-blue-800/60 bg-white/80 dark:bg-gray-900/80 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:shadow-md p-3 transition-all"
            >
              <div className="flex items-start gap-2.5">
                <div className="text-2xl flex-shrink-0">{seed.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-[13px] font-bold text-gray-900 dark:text-gray-100 leading-tight">{seed.title}</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug line-clamp-2">{seed.description}</p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {bucket.name.split(' — ')[0]} · {bucket.priceLabel}
                    </span>
                    {seed.platforms.slice(0, 1).map(p => (
                      <span key={p} className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${PLATFORM_LABEL[p]?.color || 'bg-gray-100'}`}>
                        {PLATFORM_LABEL[p]?.label || p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
