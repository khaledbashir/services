'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type SearchItem = {
  id: string
  type: string
  title: string
  subtitle: string
  href: string
}

type SearchResponse = {
  events: SearchItem[]
  venues: SearchItem[]
  staff: SearchItem[]
  tickets: SearchItem[]
  maintenance: SearchItem[]
  designs: SearchItem[]
  parts: SearchItem[]
}

const EMPTY_RESULTS: SearchResponse = {
  events: [],
  venues: [],
  staff: [],
  tickets: [],
  maintenance: [],
  designs: [],
  parts: [],
}

const GROUPS: Array<{ key: keyof SearchResponse; label: string }> = [
  { key: 'events', label: 'Events' },
  { key: 'venues', label: 'Venues' },
  { key: 'staff', label: 'Staff' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'designs', label: 'Design Requests' },
  { key: 'parts', label: 'Parts' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M8.5 14a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isShortcut) {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setDebouncedQuery('')
      setResults(EMPTY_RESULTS)
      setError(null)
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!open) return
    if (!debouncedQuery) {
      setResults(EMPTY_RESULTS)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
          signal: controller.signal,
        })
        const data = (await response.json()) as Partial<SearchResponse> & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || 'Search failed')
        }
        setResults({
          events: data.events || [],
          venues: data.venues || [],
          staff: data.staff || [],
          tickets: data.tickets || [],
          maintenance: data.maintenance || [],
          designs: data.designs || [],
          parts: data.parts || [],
        })
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError(err?.message || 'Search failed')
          setResults(EMPTY_RESULTS)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [debouncedQuery, open])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!open) return
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const totalResults = useMemo(
    () => GROUPS.reduce((sum, group) => sum + results[group.key].length, 0),
    [results],
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-[#E8E8E8] bg-white px-3 text-left text-sm text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-700 sm:w-[320px]"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <SearchIcon />
          <span className="truncate">Search across CRM</span>
        </span>
        <span className="rounded-lg border border-[#E8E8E8] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
          Cmd+K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 px-4 py-6 backdrop-blur-[1px] sm:px-6">
          <div className="mx-auto mt-8 w-full max-w-3xl" ref={panelRef}>
            <div className="rounded-2xl border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-[#E8E8E8] px-4 py-4">
                <SearchIcon />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search events, venues, staff, tickets..."
                  className="w-full border-0 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[#E8E8E8] px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50"
                >
                  Esc
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-4">
                {!debouncedQuery ? (
                  <div className="rounded-xl border border-dashed border-[#E8E8E8] bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    Start typing to search the dashboard.
                  </div>
                ) : loading ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">Searching…</div>
                ) : error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
                    {error}
                  </div>
                ) : totalResults === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#E8E8E8] bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    No matches found for “{debouncedQuery}”.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {GROUPS.map((group) => {
                      const items = results[group.key]
                      if (items.length === 0) return null

                      return (
                        <section key={group.key}>
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              {group.label}
                            </h3>
                            <span className="text-xs text-zinc-400">{items.length}</span>
                          </div>
                          <div className="space-y-2">
                            {items.map((item) => (
                              <Link
                                key={item.id}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className="block rounded-xl border border-[#E8E8E8] px-4 py-3 transition hover:border-zinc-300 hover:bg-zinc-50"
                              >
                                <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                                <div className="mt-0.5 text-xs text-zinc-500">{item.subtitle}</div>
                              </Link>
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
