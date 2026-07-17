'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface StoryPhoto {
  id: number
  title: string | null
  category: string | null
  description: string | null
  poster: string | null
  postedAt: string
  imageUrl: string
  salesLibraryUrl: string | null
  slackUrl: string | null
}

interface StoryData {
  venue: { id: string; name: string }
  shareToken: string | null
  stats: { total: number; categories: Record<string, number>; firstPhoto: string | null; lastPhoto: string | null }
  photos: StoryPhoto[]
}

function weekOf(dateIso: string): string {
  const d = new Date(dateIso)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

export default function PhotoStoryPage() {
  const params = useParams<{ venueId: string }>()
  const [data, setData] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<string>('')
  const [selected, setSelected] = useState<StoryPhoto | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/photo-story/${params.venueId}`)
      .then(r => r.json())
      .then(d => { setData(d.error ? null : d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.venueId])

  const weeks = useMemo(() => {
    if (!data) return [] as Array<{ week: string; photos: StoryPhoto[] }>
    const filtered = category ? data.photos.filter(p => p.category === category) : data.photos
    const map = new Map<string, StoryPhoto[]>()
    for (const p of filtered) {
      const w = weekOf(p.postedAt)
      if (!map.has(w)) map.set(w, [])
      map.get(w)!.push(p)
    }
    return [...map.entries()].map(([week, photos]) => ({ week, photos }))
  }, [data, category])

  const copyClientLink = async () => {
    if (!data?.shareToken) return
    await navigator.clipboard.writeText(`${window.location.origin}/story/${data.shareToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-sm text-zinc-400">Loading visual story…</p>
        ) : !data ? (
          <p className="text-sm text-zinc-400">No photos on record for this account yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0A52EF] mb-1">Account Visual Story</p>
                <h1 className="text-2xl font-bold text-zinc-900">{data.venue.name}</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  {data.stats.total} field photos
                  {data.stats.firstPhoto && (
                    <> · {new Date(data.stats.firstPhoto).toLocaleDateString()} → {new Date(data.stats.lastPhoto!).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <button
                onClick={copyClientLink}
                className="px-4 py-2 bg-[#0A52EF] text-white text-xs font-semibold rounded-lg hover:bg-[#0840C0] transition-colors"
              >
                {copied ? 'Client link copied ✓' : 'Copy client case-study link'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-8">
              <button
                onClick={() => setCategory('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!category ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              >
                All · {data.stats.total}
              </button>
              {Object.entries(data.stats.categories).map(([c, n]) => (
                <button
                  key={c}
                  onClick={() => setCategory(category === c ? '' : c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${category === c ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                  {c} · {n}
                </button>
              ))}
            </div>

            <div className="space-y-10">
              {weeks.map(({ week, photos }) => (
                <section key={week}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-sm font-bold text-zinc-900">Week of {new Date(week + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                    <div className="flex-1 h-px bg-zinc-200" />
                    <span className="text-xs text-zinc-400">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="bg-white rounded-2xl border border-zinc-100 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all"
                      >
                        <div className="aspect-[4/3] bg-zinc-900 overflow-hidden">
                          <img src={p.imageUrl} alt={p.title || 'Field photo'} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="p-3">
                          <h3 className="text-xs font-semibold text-zinc-900 line-clamp-1">{p.title || 'Field photo'}</h3>
                          {p.category && <span className="inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{p.category}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {selected && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="relative bg-zinc-900">
                    <img src={selected.imageUrl} alt={selected.title || ''} className="w-full max-h-[45vh] object-contain" />
                  </div>
                  <div className="p-6 overflow-y-auto">
                    <h2 className="text-lg font-bold text-zinc-900 mb-2">{selected.title || 'Field photo'}</h2>
                    <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-400">
                      {selected.category && <span className="font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{selected.category}</span>}
                      <span>{new Date(selected.postedAt).toLocaleDateString()}</span>
                      {selected.poster && <span>by {selected.poster}</span>}
                    </div>
                    {selected.description && <p className="text-sm text-zinc-700 leading-relaxed mb-4">{selected.description}</p>}
                    <div className="flex items-center gap-2">
                      {selected.salesLibraryUrl && (
                        <a href={selected.salesLibraryUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] transition-colors">
                          Open in Sales Library →
                        </a>
                      )}
                      {selected.slackUrl && (
                        <a href={selected.slackUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                          View original
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
