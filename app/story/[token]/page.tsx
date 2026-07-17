'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface ClientPhoto {
  title: string | null
  category: string | null
  description: string | null
  postedAt: string
  imageUrl: string
}

interface ClientStory {
  venue: { name: string }
  photos: ClientPhoto[]
}

// Client-facing case study page — public behind an unguessable link. Clean,
// branded, zero internal chrome. What the client sees: their venue, the
// technology, and the team at work.
export default function ClientStoryPage() {
  const params = useParams<{ token: string }>()
  const [data, setData] = useState<ClientStory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/story/${params.token}`)
      .then(r => r.json())
      .then(d => { setData(d.error ? null : d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.token])

  if (loading) {
    return <div className="min-h-screen bg-[#0B0B14] flex items-center justify-center"><p className="text-zinc-500 text-sm">Loading…</p></div>
  }
  if (!data) {
    return <div className="min-h-screen bg-[#0B0B14] flex items-center justify-center"><p className="text-zinc-500 text-sm">This page is not available.</p></div>
  }

  const hero = data.photos[0]

  return (
    <div className="min-h-screen bg-[#0B0B14] text-white">
      <header className="relative overflow-hidden">
        {hero && (
          <div className="absolute inset-0">
            <img src={hero.imageUrl} alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B14]/60 via-[#0B0B14]/80 to-[#0B0B14]" />
          </div>
        )}
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#5B8CFF] mb-3">ANC · In the Field</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{data.venue.name}</h1>
          <p className="text-zinc-400 mt-3 max-w-xl">
            A live look at the technology and the team behind it — captured on site, as the work happens.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.photos.map((p, i) => (
            <figure key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="aspect-[4/3] bg-black overflow-hidden">
                <img src={p.imageUrl} alt={p.title || ''} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <figcaption className="p-4">
                <p className="text-sm font-semibold">{p.title || 'On site'}</p>
                {p.description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{p.description}</p>}
                <p className="text-[10px] text-zinc-600 mt-2 uppercase tracking-wider">
                  {new Date(p.postedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-8">
        <p className="text-center text-xs text-zinc-600">ANC Sports · anc.com</p>
      </footer>
    </div>
  )
}
