'use client'

import { useEffect, useRef, useState } from 'react'

export interface LayoutSettingsColumn {
  key: string
  label: string
}

export interface DashboardLayoutPrefs {
  layout: 'horizontal' | 'stacked'
  hidden: string[]
  order: string[]
}

interface Props {
  storageKey: string
  columns: LayoutSettingsColumn[]
  prefs: DashboardLayoutPrefs
  onChange: (prefs: DashboardLayoutPrefs) => void
}

export function DashboardLayoutSettings({ storageKey, columns, prefs, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const persist = async (next: DashboardLayoutPrefs) => {
    onChange(next)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storageKey, value: JSON.stringify(next) }),
      })
    } catch {}
  }

  const setLayout = (layout: 'horizontal' | 'stacked') => persist({ ...prefs, layout })

  const toggleHidden = (key: string) => {
    const hidden = prefs.hidden.includes(key)
      ? prefs.hidden.filter(k => k !== key)
      : [...prefs.hidden, key]
    persist({ ...prefs, hidden })
  }

  const move = (key: string, dir: -1 | 1) => {
    const order = prefs.order.length ? [...prefs.order] : columns.map(c => c.key)
    const idx = order.indexOf(key)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= order.length) return
    ;[order[idx], order[swap]] = [order[swap], order[idx]]
    persist({ ...prefs, order })
  }

  const ordered = prefs.order.length
    ? prefs.order
        .map(k => columns.find(c => c.key === k))
        .filter((c): c is LayoutSettingsColumn => Boolean(c))
        .concat(columns.filter(c => !prefs.order.includes(c.key)))
    : columns

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="h-9 w-9 flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
        title="Layout"
        aria-label="Layout settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-30 w-72 rounded-xl bg-white ring-1 ring-zinc-200 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.25)] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">Layout</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['horizontal', 'stacked'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setLayout(opt)}
                className={`px-3 py-2 rounded-lg text-xs font-medium ring-1 transition-colors ${
                  prefs.layout === opt
                    ? 'bg-[#0A52EF] text-white ring-[#0A52EF]'
                    : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-300'
                }`}
              >
                {opt === 'horizontal' ? 'Side-by-side' : 'Stacked'}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">Columns</div>
          <div className="space-y-1">
            {ordered.map((col, idx) => {
              const isHidden = prefs.hidden.includes(col.key)
              return (
                <div key={col.key} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => toggleHidden(col.key)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
                  />
                  <span className={`flex-1 text-xs ${isHidden ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>{col.label}</span>
                  <button
                    onClick={() => move(col.key, -1)}
                    disabled={idx === 0}
                    className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                    title="Move up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => move(col.key, 1)}
                    disabled={idx === ordered.length - 1}
                    className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                    title="Move down"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => persist({ layout: 'horizontal', hidden: [], order: [] })}
            className="mt-3 w-full text-[11px] text-zinc-500 hover:text-zinc-900 py-1.5"
          >
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}

export function applyLayoutPrefs<T extends LayoutSettingsColumn>(
  columns: T[],
  prefs: DashboardLayoutPrefs,
): T[] {
  const visible = columns.filter(c => !prefs.hidden.includes(c.key))
  if (!prefs.order.length) return visible
  const orderedKeys = prefs.order.filter(k => visible.some(c => c.key === k))
  const knownInOrder = orderedKeys.map(k => visible.find(c => c.key === k)!).filter(Boolean)
  const rest = visible.filter(c => !orderedKeys.includes(c.key))
  return [...knownInOrder, ...rest]
}

export const DEFAULT_LAYOUT_PREFS: DashboardLayoutPrefs = {
  layout: 'horizontal',
  hidden: [],
  order: [],
}

export async function loadLayoutPrefs(storageKey: string): Promise<DashboardLayoutPrefs> {
  try {
    const res = await fetch(`/api/preferences?key=${encodeURIComponent(storageKey)}`)
    if (!res.ok) return DEFAULT_LAYOUT_PREFS
    const data = await res.json()
    if (!data?.value) return DEFAULT_LAYOUT_PREFS
    const parsed = JSON.parse(data.value)
    return {
      layout: parsed.layout === 'stacked' ? 'stacked' : 'horizontal',
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((v: unknown) => typeof v === 'string') : [],
      order: Array.isArray(parsed.order) ? parsed.order.filter((v: unknown) => typeof v === 'string') : [],
    }
  } catch {
    return DEFAULT_LAYOUT_PREFS
  }
}
