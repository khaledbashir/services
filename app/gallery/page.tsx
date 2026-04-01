'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  source: 'kb' | 'ticket'
  venue_name: string | null
  ticket_number: number | null
  similarity?: number
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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/gallery').then(r => r.json()).then(d => {
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

  const displayItems = searchResults.length > 0 ? searchResults : items
  const isSearchMode = searchResults.length > 0 || searching

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" /></svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">Visual Issue Gallery</h1>
                <p className="text-xs text-zinc-500">Every photo ever taken. Drop an image to find similar issues across all venues.</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-zinc-900">{items.length}</p>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Photos</p>
          </div>
        </div>

        {/* Search Bar */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
            dragOver ? 'border-amber-400 shadow-lg shadow-amber-500/10' : 'border-zinc-200 shadow-sm'
          }`}
        >
          {searchImage && (
            <div className="border-b border-zinc-100 bg-zinc-50 p-3 flex items-center gap-3">
              <img src={searchImage.data} alt="" className="h-16 w-24 object-cover rounded-lg" />
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-700">{searchImage.name}</p>
                <p className="text-[10px] text-zinc-400">Drop a different photo to replace</p>
              </div>
              <button onClick={() => { setSearchImage(null); setSearchResults([]) }} className="text-zinc-400 hover:text-zinc-600 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          <div className="p-3 flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400 transition-colors flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder={searchImage ? 'Add context to refine search...' : 'Search by description or drop a photo...'}
              className="flex-1 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none bg-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={searching || (!searchImage && !searchText)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg hover:shadow-amber-500/25 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              {searching ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Searching...</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Find Similar</>
              )}
            </button>
          </div>
        </div>

        {/* Results header */}
        {isSearchMode && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              {searching ? 'Searching...' : `${searchResults.length} similar issue${searchResults.length !== 1 ? 's' : ''} found`}
            </p>
            <button onClick={() => { setSearchResults([]); setSearchImage(null); setSearchText('') }} className="text-xs text-[#0A52EF] hover:underline">
              Clear search
            </button>
          </div>
        )}

        {/* Gallery Grid */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400 text-sm">Loading gallery...</div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-16 bg-white border border-zinc-200 rounded-xl">
            <p className="text-zinc-400 text-sm">{isSearchMode ? 'No similar issues found.' : 'No photos yet. Diagnose issues in the Knowledge Base to build the gallery.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {displayItems.map(item => (
              <div
                key={`${item.source}-${item.id}`}
                onClick={() => setSelected(item)}
                className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:shadow-lg hover:border-zinc-300 transition-all cursor-pointer group"
              >
                {/* Image */}
                <div className="aspect-[4/3] bg-zinc-100 overflow-hidden relative">
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {item.similarity && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.similarity >= 80 ? 'bg-emerald-500 text-white' :
                      item.similarity >= 60 ? 'bg-amber-500 text-white' :
                      'bg-zinc-800/60 text-white'
                    }`}>
                      {item.similarity}%
                    </div>
                  )}
                  <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    item.source === 'ticket' ? 'bg-blue-500 text-white' : 'bg-violet-500 text-white'
                  }`}>
                    {item.source === 'ticket' ? 'Ticket' : 'KB'}
                  </div>
                </div>
                {/* Info */}
                <div className="p-3">
                  <h3 className="text-xs font-semibold text-zinc-900 line-clamp-1">{item.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {item.issue_type && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{item.issue_type}</span>
                    )}
                    {item.venue_name && (
                      <span className="text-[9px] text-zinc-400 truncate">{item.venue_name}</span>
                    )}
                  </div>
                  {item.ticket_number && (
                    <p className="text-[9px] text-zinc-400 font-mono mt-1">T-{String(item.ticket_number).padStart(5, '0')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Image */}
              <div className="relative bg-zinc-900">
                <img src={selected.image_url} alt={selected.title} className="w-full max-h-[40vh] object-contain" />
                <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {/* Details */}
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
                <div className="flex items-center gap-2 mb-4">
                  {selected.issue_type && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{selected.issue_type}</span>}
                  {selected.venue_name && <span className="text-[11px] text-zinc-400">{selected.venue_name}</span>}
                  <span className="text-[11px] text-zinc-300">{new Date(selected.created_at).toLocaleDateString()}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${selected.source === 'ticket' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>
                    {selected.source === 'ticket' ? `Ticket #${selected.ticket_number}` : 'Knowledge Base'}
                  </span>
                </div>
                {selected.description && (
                  <p className="text-sm text-zinc-700 leading-relaxed mb-4">{selected.description}</p>
                )}
                {selected.suggested_fix && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
                      {selected.source === 'ticket' ? 'Resolution' : 'Suggested Fix'}
                    </p>
                    <p className="text-sm text-emerald-900 leading-relaxed">{selected.suggested_fix}</p>
                  </div>
                )}
                {selected.source === 'ticket' && selected.id && (
                  <button
                    onClick={() => router.push(`/tickets/${selected.id}`)}
                    className="mt-4 px-4 py-2 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] transition-colors"
                  >
                    View Full Ticket →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
