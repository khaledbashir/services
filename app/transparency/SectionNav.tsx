'use client'

import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'pay',        label: 'Pay & top-ups' },
  { id: 'shipped',    label: 'Shipped' },
  { id: 'activity',   label: 'Live activity' },
  { id: 'platforms',  label: 'By platform' },
  { id: 'queue',      label: 'Open queue' },
  { id: 'coverage',   label: "What's covered" },
]

export default function SectionNav() {
  const [active, setActive] = useState<string>('overview')

  useEffect(() => {
    const targets = SECTIONS
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    )
    targets.forEach(t => observer.observe(t))
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      data-no-print="true"
      className="sticky top-[68px] z-[5] -mx-5 px-5 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800"
      aria-label="Dashboard sections"
    >
      <div className="flex flex-wrap gap-1.5 overflow-x-auto -my-1 py-1">
        {SECTIONS.map(s => {
          const isActive = active === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {s.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
