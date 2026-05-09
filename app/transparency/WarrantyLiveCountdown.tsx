'use client'

import { useEffect, useState } from 'react'

interface Props {
  expiresAt: string | null
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

export default function WarrantyLiveCountdown({ expiresAt }: Props) {
  const target = expiresAt ? new Date(expiresAt).getTime() : 0
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [target])

  if (!expiresAt || !target) {
    return <span>no active warranties</span>
  }

  const { d, h, m, s, total } = diffParts(target, now)
  if (total === 0) return <span>warranty expired</span>

  return (
    <span className="font-mono tabular-nums">
      {d}d {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      <span className="font-sans ml-1.5 text-emerald-600/70 dark:text-emerald-400/70">until newest fix expires</span>
    </span>
  )
}
