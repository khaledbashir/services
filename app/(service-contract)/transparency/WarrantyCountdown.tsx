'use client'

import { useEffect, useState } from 'react'

interface Props {
  shippedAt: string         // ISO timestamp
  expiresAt: string         // ISO timestamp (shippedAt + 30 days)
}

function diffParts(target: number, now: number): { d: number; h: number; m: number; s: number; total: number } {
  const total = Math.max(0, target - now)
  const totalSec = Math.floor(total / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return { d, h, m, s, total }
}

export default function WarrantyCountdown({ shippedAt, expiresAt }: Props) {
  const target = new Date(expiresAt).getTime()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const { d, h, m, s, total } = diffParts(target, now)

  if (total === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-semibold whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Warranty expired
      </div>
    )
  }

  const tone =
    d >= 14 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : d >= 7 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  const dotTone =
    d >= 14 ? 'bg-emerald-500'
    : d >= 7 ? 'bg-amber-500'
    : 'bg-rose-500'

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${tone} text-xs font-mono font-semibold whitespace-nowrap tabular-nums`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotTone} ${d <= 7 ? 'animate-pulse' : ''}`} />
      {d}d {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  )
}
