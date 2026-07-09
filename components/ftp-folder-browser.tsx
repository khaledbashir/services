'use client'

import { useCallback, useEffect, useState } from 'react'

export type FtpEntry = { name: string; path: string; type: 'dir' | 'file'; size: number; kind?: string }
export type FtpListing = {
  path: string
  parent: string | null
  entries: FtpEntry[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  resolvedFrom?: string | null
}

/**
 * Reusable one-level-at-a-time FTP folder browser. Never lists the whole tree
 * (the root is ~20k folders). Optionally opens pre-navigated to a client's
 * folder via `triCode`. Calls `onSelect(path)` when the user picks a folder.
 */
export function FtpFolderBrowser({
  selected,
  onSelect,
  triCode,
}: {
  selected: string | null
  onSelect: (p: string | null) => void
  triCode?: string | null
}) {
  const [path, setPath] = useState<string | null>(null) // null until first load resolves
  const [listing, setListing] = useState<FtpListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [didResolve, setDidResolve] = useState(false)

  const load = useCallback(
    async (p: string | null, pg: number, useTriCode: boolean) => {
      setLoading(true)
      setErr(null)
      try {
        const qs = new URLSearchParams({ page: String(pg), pageSize: '100' })
        if (p) qs.set('path', p)
        else if (useTriCode && triCode) qs.set('triCode', triCode)
        const res = await fetch(`/api/proof-ftp/browse?${qs.toString()}`)
        const data = await res.json()
        if (!res.ok) {
          setErr(data.error || `Error ${res.status}`)
          setListing(null)
          return
        }
        setListing(data)
        setPath(data.path) // sync to whatever the server actually listed (tri-code may have redirected)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to browse')
      } finally {
        setLoading(false)
      }
    },
    [triCode]
  )

  // Initial load — resolve tri-code once, then browse by path afterwards.
  useEffect(() => {
    if (!didResolve) {
      setDidResolve(true)
      load(null, 1, true)
    }
  }, [didResolve, load])

  const go = (p: string) => {
    setPage(1)
    setPath(p)
    load(p, 1, false)
  }
  const changePage = (pg: number) => {
    setPage(pg)
    load(path, pg, false)
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs">
        <button
          type="button"
          disabled={loading || !listing?.parent}
          onClick={() => listing?.parent && go(listing.parent)}
          className="px-2 py-1 rounded bg-white border border-gray-200 text-gray-600 disabled:opacity-40 hover:border-gray-300"
        >
          ↑ Up
        </button>
        <span className="font-mono text-gray-700 truncate">{path || '…'}</span>
        {listing?.resolvedFrom && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">opened via {listing.resolvedFrom}</span>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {loading && <div className="px-3 py-6 text-center text-xs text-gray-400">Loading…</div>}
        {err && <div className="px-3 py-3 text-xs text-red-600">{err}</div>}
        {!loading && !err && listing && listing.entries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-400">Empty folder</div>
        )}
        {!loading &&
          !err &&
          listing?.entries.map((e) =>
            e.type === 'dir' ? (
              <button
                key={e.path}
                type="button"
                onClick={() => go(e.path)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                <span className="text-gray-400">📁</span>
                <span className="truncate text-gray-800">{e.name}</span>
              </button>
            ) : (
              <div key={e.path} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-gray-300">{e.kind === 'video' ? '🎬' : e.kind === 'image' ? '🖼️' : '📄'}</span>
                <span className="truncate text-gray-500">{e.name}</span>
              </div>
            )
          )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs">
        <div className="flex items-center gap-1">
          <button type="button" disabled={loading || page <= 1} onClick={() => changePage(page - 1)} className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40">‹</button>
          <span className="text-gray-500">
            {listing ? `${listing.entries.length ? (page - 1) * 100 + 1 : 0}–${(page - 1) * 100 + listing.entries.length} of ${listing.total}` : ''}
          </span>
          <button type="button" disabled={loading || !listing?.hasMore} onClick={() => changePage(page + 1)} className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40">›</button>
        </div>
        <button
          type="button"
          onClick={() => path && onSelect(path)}
          disabled={!path || path === '/'}
          className={`px-3 py-1.5 rounded-md font-medium text-white ${selected && selected === path ? 'bg-green-600' : 'bg-[color:var(--anc-brand,#0A52EF)] hover:opacity-90'} disabled:opacity-40`}
        >
          {selected && selected === path ? '✓ Selected this folder' : 'Use this folder'}
        </button>
      </div>

      {selected && (
        <div className="px-3 py-2 bg-green-50 border-t border-green-200 text-xs text-green-800 font-mono truncate">Selected: {selected}</div>
      )}
    </div>
  )
}
