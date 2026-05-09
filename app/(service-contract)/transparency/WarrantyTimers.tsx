'use client'

import { useEffect, useState } from 'react'

interface Platform {
  id: string
  slug: string
  name: string
  tagline: string | null
  delivered_at: string
  warranty_days: number
}

function diffParts(target: number, now: number) {
  const total = Math.max(0, target - now)
  const totalSec = Math.floor(total / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return { d, h, m, s, total }
}

export default function WarrantyTimers() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [now, setNow] = useState<number>(() => Date.now())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platforms')
      .then(r => r.json())
      .then(d => setPlatforms(d.platforms || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  if (loading) return null
  if (!platforms.length) return null

  return (
    <section className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50/60 to-emerald-100/30 dark:from-emerald-950/30 dark:to-emerald-950/10 p-5 shadow-sm mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Warranty timers — every platform
          </h2>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            Each platform carries a 30-day post-delivery responsibility window. Counting down live.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400/70">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {platforms.map(p => {
          const deliveredMs = new Date(p.delivered_at).getTime()
          const expiresMs = deliveredMs + p.warranty_days * 24 * 60 * 60 * 1000
          const { d, h, m, s, total } = diffParts(expiresMs, now)
          const expired = total === 0
          const urgent = !expired && d <= 7
          const tone = expired
            ? 'border-gray-300 bg-gray-50 dark:bg-gray-900/60 dark:border-gray-700'
            : urgent
              ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/60'
              : 'border-emerald-300 bg-white dark:bg-gray-900 dark:border-emerald-900/60'

          return (
            <div
              key={p.id}
              className={`rounded-xl border-2 p-4 transition-colors ${tone}`}
            >
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 mb-1">
                {p.name}
              </div>
              {p.tagline && (
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-3 leading-tight line-clamp-2">
                  {p.tagline}
                </div>
              )}

              {expired ? (
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  Warranty expired
                </div>
              ) : (
                <>
                  <div className="font-mono tabular-nums text-2xl font-bold leading-none text-gray-900 dark:text-gray-100">
                    {d}<span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-0.5">d</span>
                  </div>
                  <div className="font-mono tabular-nums text-base text-gray-600 dark:text-gray-300 mt-1.5">
                    {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
                  </div>
                  <div className={`text-[10px] mt-2 ${urgent ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                    {urgent ? 'expiring soon' : 'until warranty expires'}
                  </div>
                </>
              )}

              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                delivered {new Date(p.delivered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
