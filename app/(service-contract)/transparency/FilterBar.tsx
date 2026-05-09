'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export type FilterState = {
  preset: 'this-month' | 'last-30' | 'last-month' | 'all-time' | 'custom'
  from: string | null     // ISO date YYYY-MM-DD
  to: string | null
  stakeholders: string[]
  platforms: string[]
  type: 'all' | 'CONTRACT' | 'CO'
  statuses: string[]
  search: string
}

interface Props {
  allStakeholders: string[]
  allPlatforms: string[]
  initial: FilterState
  onChange: (next: FilterState) => void
}

const PRESET_LABEL: Record<FilterState['preset'], string> = {
  'this-month':  'This month',
  'last-30':     'Last 30 days',
  'last-month':  'Last month',
  'all-time':    'All time',
  'custom':      'Custom',
}

const STATUS_OPTIONS = [
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'quoted',      label: 'Quoted' },
  { key: 'shipped',     label: 'Shipped' },
]

function presetRange(p: FilterState['preset']): { from: string | null; to: string | null } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (p === 'all-time') return { from: null, to: null }
  if (p === 'last-30') {
    const f = new Date(now); f.setDate(f.getDate() - 30)
    return { from: iso(f), to: iso(now) }
  }
  if (p === 'this-month') {
    const f = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: iso(f), to: iso(now) }
  }
  if (p === 'last-month') {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const t = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: iso(f), to: iso(t) }
  }
  return { from: null, to: null }
}

export default function FilterBar({ allStakeholders, allPlatforms, initial, onChange }: Props) {
  const [state, setState] = useState<FilterState>(initial)
  const [stakeholdersOpen, setStakeholdersOpen] = useState(false)
  const [platformsOpen, setPlatformsOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Push state up + sync URL
  useEffect(() => {
    onChange(state)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString())
      const setOrDelete = (k: string, v: string | string[] | null) => {
        if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) sp.delete(k)
        else sp.set(k, Array.isArray(v) ? v.join(',') : v)
      }
      setOrDelete('preset', state.preset === 'this-month' ? null : state.preset)
      setOrDelete('from', state.preset === 'custom' ? state.from : null)
      setOrDelete('to', state.preset === 'custom' ? state.to : null)
      setOrDelete('who', state.stakeholders)
      setOrDelete('platform', state.platforms)
      setOrDelete('type', state.type === 'all' ? null : state.type)
      setOrDelete('status', state.statuses)
      setOrDelete('q', state.search)
      const qs = sp.toString()
      const target = qs ? `${pathname}?${qs}` : pathname
      router.replace(target, { scroll: false })
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const setPreset = (p: FilterState['preset']) => {
    if (p === 'custom') {
      setState((s) => ({ ...s, preset: p }))
    } else {
      const { from, to } = presetRange(p)
      setState((s) => ({ ...s, preset: p, from, to }))
    }
  }

  const toggleArr = (key: 'stakeholders' | 'platforms' | 'statuses', v: string) => {
    setState((s) => {
      const arr = s[key]
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
      return { ...s, [key]: next }
    })
  }

  const activeCount =
    (state.preset === 'this-month' ? 0 : 1) +
    state.stakeholders.length +
    state.platforms.length +
    (state.type === 'all' ? 0 : 1) +
    state.statuses.length +
    (state.search ? 1 : 0)

  const reset = () =>
    setState({
      preset: 'this-month',
      ...presetRange('this-month'),
      stakeholders: [],
      platforms: [],
      type: 'all',
      statuses: [],
      search: '',
    })

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2.5 shadow-sm" data-no-print="true">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date preset */}
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-0.5">
          {(['this-month', 'last-30', 'last-month', 'all-time'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${
                state.preset === p
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>

        {/* Stakeholder dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setStakeholdersOpen((v) => !v)
              setPlatformsOpen(false)
              setStatusesOpen(false)
            }}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
              state.stakeholders.length > 0
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span>From</span>
            {state.stakeholders.length > 0 ? (
              <span className="text-[10px] font-bold tabular-nums bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full px-1.5">
                {state.stakeholders.length}
              </span>
            ) : null}
            <span className="text-gray-400">▾</span>
          </button>
          {stakeholdersOpen ? (
            <div className="absolute top-full left-0 mt-1 z-30 w-56 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg p-1">
              {allStakeholders.length === 0 ? (
                <div className="px-2 py-2 text-xs text-gray-400 italic">No stakeholders yet</div>
              ) : (
                allStakeholders.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={state.stakeholders.includes(s)}
                      onChange={() => toggleArr('stakeholders', s)}
                      className="rounded"
                    />
                    <span className="truncate">{s}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Platform dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setPlatformsOpen((v) => !v)
              setStakeholdersOpen(false)
              setStatusesOpen(false)
            }}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
              state.platforms.length > 0
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span>Platform</span>
            {state.platforms.length > 0 ? (
              <span className="text-[10px] font-bold tabular-nums bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full px-1.5">
                {state.platforms.length}
              </span>
            ) : null}
            <span className="text-gray-400">▾</span>
          </button>
          {platformsOpen ? (
            <div className="absolute top-full left-0 mt-1 z-30 w-56 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg p-1">
              {allPlatforms.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={state.platforms.includes(p)}
                    onChange={() => toggleArr('platforms', p)}
                    className="rounded"
                  />
                  <span className="truncate">{p}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {/* Type segmented */}
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-0.5">
          {(['all', 'CONTRACT', 'CO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setState((s) => ({ ...s, type: t }))}
              className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${
                state.type === t
                  ? t === 'CONTRACT'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    : t === 'CO'
                      ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t === 'all' ? 'All types' : t === 'CONTRACT' ? 'Contract' : 'Change Order'}
            </button>
          ))}
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setStatusesOpen((v) => !v)
              setStakeholdersOpen(false)
              setPlatformsOpen(false)
            }}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
              state.statuses.length > 0
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span>Status</span>
            {state.statuses.length > 0 ? (
              <span className="text-[10px] font-bold tabular-nums bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full px-1.5">
                {state.statuses.length}
              </span>
            ) : null}
            <span className="text-gray-400">▾</span>
          </button>
          {statusesOpen ? (
            <div className="absolute top-full left-0 mt-1 z-30 w-44 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg p-1">
              {STATUS_OPTIONS.map((o) => (
                <label
                  key={o.key}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={state.statuses.includes(o.key)}
                    onChange={() => toggleArr('statuses', o.key)}
                    className="rounded"
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {/* Search */}
        <input
          type="text"
          value={state.search}
          onChange={(e) => setState((s) => ({ ...s, search: e.target.value }))}
          placeholder="Search…"
          className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[140px] max-w-[260px]"
        />

        {/* Reset */}
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium ml-auto"
          >
            Clear {activeCount}
          </button>
        ) : null}
      </div>

      {/* Custom date range */}
      {state.preset === 'custom' ? (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Range</span>
          <input
            type="date"
            value={state.from || ''}
            onChange={(e) => setState((s) => ({ ...s, from: e.target.value || null }))}
            className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={state.to || ''}
            onChange={(e) => setState((s) => ({ ...s, to: e.target.value || null }))}
            className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1"
          />
        </div>
      ) : null}
    </div>
  )
}

export function parseFiltersFromUrl(searchParams: URLSearchParams): FilterState {
  const preset = (searchParams.get('preset') as FilterState['preset']) || 'this-month'
  const fromUrl = searchParams.get('from')
  const toUrl = searchParams.get('to')
  const presetRng = preset === 'custom' ? { from: fromUrl, to: toUrl } : presetRange(preset)
  return {
    preset,
    from: presetRng.from,
    to: presetRng.to,
    stakeholders: (searchParams.get('who') || '').split(',').filter(Boolean),
    platforms: (searchParams.get('platform') || '').split(',').filter(Boolean),
    type: (searchParams.get('type') as FilterState['type']) || 'all',
    statuses: (searchParams.get('status') || '').split(',').filter(Boolean),
    search: searchParams.get('q') || '',
  }
}

export function applyFilters<T extends {
  received_at: string
  shipped_at: string | null
  requester: string | null
  classification: 'FIX' | 'NEW' | 'MIXED'
  retainer_covered: boolean
  status: string
  summary: string
  repo: string | null
}>(
  rows: T[],
  f: FilterState,
): T[] {
  const fromMs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null
  const toMs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    // date — anchor on shipped_at if shipped, else received_at
    const anchorMs = new Date(r.shipped_at || r.received_at).getTime()
    if (fromMs != null && anchorMs < fromMs) return false
    if (toMs != null && anchorMs > toMs) return false
    if (f.stakeholders.length > 0 && !f.stakeholders.includes(r.requester || '— unattributed —')) return false
    if (f.platforms.length > 0 && !f.platforms.includes(r.repo || 'other')) return false
    if (f.type !== 'all') {
      const isCO = r.classification === 'NEW' || r.classification === 'MIXED' || !r.retainer_covered
      if (f.type === 'CONTRACT' && isCO) return false
      if (f.type === 'CO' && !isCO) return false
    }
    if (f.statuses.length > 0 && !f.statuses.includes(r.status)) return false
    if (q) {
      const hay = (r.summary + ' ' + (r.requester || '')).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
