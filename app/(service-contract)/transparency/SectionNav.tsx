'use client'

import { useEffect, useState } from 'react'
import PrintButton from './PrintButton'

interface NavItem {
  id: string
  label: string
  description: string
}

const SECTIONS: NavItem[] = [
  { id: 'overview',   label: 'Overview',        description: 'Hours · warranty · change orders' },
  { id: 'pay',        label: 'Pay & top-ups',   description: 'Add hours · pay invoice' },
  { id: 'shipped',    label: 'Shipped',         description: 'What landed this month' },
  { id: 'activity',   label: 'Live activity',   description: 'Recent triages + ships' },
  { id: 'platforms',  label: 'By platform',     description: 'Per-system breakdown' },
  { id: 'queue',      label: 'Open queue',      description: 'Active requests + COs' },
  { id: 'coverage',   label: "What's covered",  description: 'Contract clauses' },
]

export default function SectionNav({ generatedAt }: { generatedAt?: string }) {
  const [active, setActive] = useState<string>('overview')

  useEffect(() => {
    const targets = SECTIONS
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    )
    targets.forEach(t => observer.observe(t))
    return () => observer.disconnect()
  }, [])

  return (
    <aside
      data-no-print="true"
      className="sticky top-0 self-start hidden lg:flex flex-col h-screen border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 -ml-5 pl-5 pr-4 py-6"
      aria-label="Transparency dashboard"
    >
      {/* Brand block */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" className="h-8 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC Sports" className="h-8 w-auto hidden dark:block" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 dark:text-zinc-400 leading-none mb-0.5">
          Service
        </div>
        <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight">
          Transparency
        </div>
        {generatedAt && (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 mt-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            live · {new Date(generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Section nav */}
      <nav className="flex flex-col gap-0.5 mb-6 flex-1 overflow-y-auto -mx-1 px-1">
        {SECTIONS.map(s => {
          const isActive = active === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`group block px-3 py-2 rounded-md transition-colors border-l-2 ${
                isActive
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white shadow-sm'
                  : 'border-transparent text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40'
              }`}
            >
              <div className="text-sm font-medium leading-tight">{s.label}</div>
              <div className={`text-[11px] mt-0.5 leading-tight ${
                isActive ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400'
              }`}>
                {s.description}
              </div>
            </a>
          )
        })}
      </nav>

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 px-3 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
          Manage
        </div>
        <div className="flex flex-col gap-1.5">
          <a href="/service-log/change-orders" className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100">
            Change orders board →
          </a>
          <a href="/inbox" className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100">
            Morning brief →
          </a>
          <a href="/service-log" className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100">
            Full service log →
          </a>
        </div>
      </div>

      <div className="px-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <a href="/" className="text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← Back to app
        </a>
        <PrintButton />
      </div>
    </aside>
  )
}

/**
 * Mobile / narrow-screen fallback — same anchors as the desktop sidebar but
 * rendered as a horizontal scroll strip. Keeps wayfinding on phones.
 */
export function SectionNavMobile() {
  const [active, setActive] = useState<string>('overview')

  useEffect(() => {
    const targets = SECTIONS
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
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
      className="lg:hidden sticky top-0 z-[5] -mx-5 px-5 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800"
      aria-label="Dashboard sections"
    >
      <div className="flex gap-1.5 overflow-x-auto -my-1 py-1">
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
