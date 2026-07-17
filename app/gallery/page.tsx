'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface GalleryItem {
  id: string
  title: string
  description: string
  issue_type: string
  suggested_fix: string
  image_url: string
  created_at: string
  source: 'kb' | 'ticket' | 'slack'
  venue_name: string | null
  ticket_number: number | null
  similarity?: number
  poster?: string | null
  web_url?: string | null
  slack_permalink?: string | null
  venue_id?: string | null
  ai_tags?: string[] | null
}

const SOURCE_META: Record<GalleryItem['source'], { label: string; dot: string; chip: string }> = {
  slack: { label: 'Field Photo', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700' },
  kb: { label: 'Knowledge Base', dot: 'bg-violet-500', chip: 'bg-violet-100 text-violet-600' },
  ticket: { label: 'Ticket', dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-600' },
}

export default function GalleryPage() {
  const router = useRouter()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchImage, setSearchImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<GalleryItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const [sourceFilter, setSourceFilter] = useState<'' | GalleryItem['source']>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/gallery?limit=200').then(r => r.json()).then(d => {
      setItems(d.items || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const processFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setSearchImage({ data: reader.result as string, mimeType: file.type, name: file.name })
      setSearchResults([])
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) processFile(file)
  }, [])

  const handleSearch = async () => {
    if (!searchImage && !searchText) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: searchImage ? { data: searchImage.data, mimeType: searchImage.mimeType } : undefined,
          text: searchText || undefined,
        }),
      })
      const data = await res.json()
      setSearchResults(data.matches || [])
    } catch {} finally { setSearching(false) }
  }

  const isSearchMode = searchResults.length > 0 || searching
  const baseItems = searchResults.length > 0 ? searchResults : items

  // The intelligence strip: filters carry live counts, so the chips themselves
  // read as a snapshot of what the field has captured.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of baseItems) {
      if (!i.issue_type) continue
      counts.set(i.issue_type, (counts.get(i.issue_type) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [baseItems])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { slack: 0, kb: 0, ticket: 0 }
    for (const i of baseItems) counts[i.source] = (counts[i.source] || 0) + 1
    return counts
  }, [baseItems])

  const venueCount = useMemo(
    () => new Set(items.filter(i => i.venue_name).map(i => i.venue_name)).size,
    [items]
  )

  const displayItems = useMemo(
    () => baseItems.filter(i =>
      (!sourceFilter || i.source === sourceFilter) &&
      (!categoryFilter || i.issue_type === categoryFilter)
    ),
    [baseItems, sourceFilter, categoryFilter]
  )

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0A52EF] mb-1.5">Field Intelligence</p>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Photo Gallery</h1>
            <p className="text-sm text-zinc-500 mt-1">Every photo the field takes — captured, understood, searchable.</p>
          </div>
          <div className="flex items-center gap-6 pb-1">
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900 tabular-nums">{items.length}</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Photos</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900 tabular-nums">{venueCount}</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Venues</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900 tabular-nums">{sourceCounts.slack}</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">From the field</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
            dragOver ? 'border-[#0A52EF] shadow-lg shadow-blue-500/10' : 'border-zinc-200 shadow-sm'
          }`}
        >
          {searchImage && (
            <div className="border-b border-zinc-100 bg-zinc-50 p-3 flex items-center gap-3">
              <img src={searchImage.data} alt="" className="h-16 w-24 object-cover rounded-lg" />
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-700">{searchImage.name}</p>
                <p className="text-[10px] text-zinc-400">Drop a different photo to replace it</p>
              </div>
              <button onClick={() => { setSearchImage(null); setSearchResults([]) }} className="text-zinc-400 hover:text-zinc-600 p-1" aria-label="Remove photo">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          <div className="p-3 flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors flex-shrink-0 text-[11px] font-medium"
              title="Search with a photo"
            >
              <svg className="w-4.5 h-4.5 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder={searchImage ? 'Add words to refine the match…' : 'Describe what you\'re looking for, or drop a photo…'}
              className="flex-1 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none bg-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={searching || (!searchImage && !searchText)}
              className="px-4 py-2 bg-[#0A52EF] text-white text-xs font-semibold rounded-lg hover:bg-[#0840C0] disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {searching ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Searching…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Find similar</>
              )}
            </button>
          </div>
        </div>

        {/* Intelligence strip — filters with live counts */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSourceFilter(''); setCategoryFilter('') }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!sourceFilter && !categoryFilter ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
          >
            All · {baseItems.length}
          </button>
          {(['slack', 'kb', 'ticket'] as const).map(s => sourceCounts[s] > 0 && (
            <button
              key={s}
              onClick={() => setSourceFilter(sourceFilter === s ? '' : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sourceFilter === s ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_META[s].dot}`} />
              {SOURCE_META[s].label} · {sourceCounts[s]}
            </button>
          ))}
          <div className="w-px h-5 bg-zinc-200 mx-1" />
          {categoryCounts.slice(0, 8).map(([c, n]) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(categoryFilter === c ? '' : c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-[#0A52EF] text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-300'}`}
            >
              {c} · {n}
            </button>
          ))}
        </div>

        {/* Results header */}
        {isSearchMode && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              {searching ? 'Matching against every photo on record…' : `${searchResults.length} match${searchResults.length !== 1 ? 'es' : ''} found`}
            </p>
            <button onClick={() => { setSearchResults([]); setSearchImage(null); setSearchText('') }} className="text-xs text-[#0A52EF] hover:underline">
              Clear search
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-zinc-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-16 bg-white border border-zinc-200 rounded-2xl">
            <p className="text-zinc-500 text-sm font-medium">
              {isSearchMode ? 'No matches for that search.' : 'No photos match these filters.'}
            </p>
            <p className="text-zinc-400 text-xs mt-1">
              {isSearchMode ? 'Try different words, or drop a photo to match against.' : 'Clear a filter to see more.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayItems.map(item => (
              <div
                key={`${item.source}-${item.id}`}
                onClick={() => setSelected(item)}
                className="group relative rounded-2xl overflow-hidden cursor-pointer bg-zinc-900 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" loading="lazy" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-10 pb-3 px-3">
                  <h3 className="text-xs font-semibold text-white line-clamp-1">{item.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_META[item.source].dot}`} />
                    {item.venue_name && <span className="text-[10px] text-zinc-300 truncate">{item.venue_name}</span>}
                    {item.issue_type && <span className="text-[10px] text-zinc-400 truncate">{item.issue_type}</span>}
                  </div>
                </div>
                {item.similarity && (
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.similarity >= 80 ? 'bg-emerald-500 text-white' :
                    item.similarity >= 60 ? 'bg-amber-500 text-white' :
                    'bg-black/50 text-white'
                  }`}>
                    {item.similarity}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="relative bg-zinc-900">
                <img src={selected.image_url} alt={selected.title} className="w-full max-h-[40vh] object-contain" />
                <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors" aria-label="Close">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-lg font-bold text-zinc-900">{selected.title}</h2>
                  {selected.similarity && (
                    <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                      selected.similarity >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      selected.similarity >= 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-zinc-100 text-zinc-600'
                    }`}>{selected.similarity}% match</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${SOURCE_META[selected.source].chip}`}>
                    {selected.source === 'ticket' ? `Ticket #${selected.ticket_number}` : SOURCE_META[selected.source].label}
                  </span>
                  {selected.issue_type && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{selected.issue_type}</span>}
                  {selected.venue_name && <span className="text-[11px] text-zinc-400">{selected.venue_name}</span>}
                  <span className="text-[11px] text-zinc-300">{new Date(selected.created_at).toLocaleDateString()}</span>
                  {selected.source === 'slack' && selected.poster && (
                    <span className="text-[11px] text-zinc-400">by {selected.poster}</span>
                  )}
                </div>
                {selected.description && (
                  <p className="text-sm text-zinc-700 leading-relaxed mb-4">{selected.description}</p>
                )}
                {Array.isArray(selected.ai_tags) && selected.ai_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {selected.ai_tags.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-500">{t}</span>
                    ))}
                  </div>
                )}
                {selected.suggested_fix && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
                      {selected.source === 'ticket' ? 'Resolution' : 'Suggested Fix'}
                    </p>
                    <p className="text-sm text-emerald-900 leading-relaxed">{selected.suggested_fix}</p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {selected.source === 'ticket' && selected.id && (
                    <button
                      onClick={() => router.push(`/tickets/${selected.id}`)}
                      className="px-4 py-2 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] transition-colors"
                    >
                      View full ticket →
                    </button>
                  )}
                  {selected.source === 'slack' && selected.venue_id && (
                    <button
                      onClick={() => router.push(`/photo-story/${selected.venue_id}`)}
                      className="px-4 py-2 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] transition-colors"
                    >
                      Open account visual story →
                    </button>
                  )}
                  {selected.source === 'slack' && selected.web_url && (
                    <a href={selected.web_url} target="_blank" rel="noreferrer"
                      className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                      Open in Sales Library
                    </a>
                  )}
                  {selected.source === 'slack' && selected.slack_permalink && (
                    <a href={selected.slack_permalink} target="_blank" rel="noreferrer"
                      className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                      View original message
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
