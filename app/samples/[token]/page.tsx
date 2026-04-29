'use client'

import { useEffect, useState } from 'react'

interface Item {
  id: string
  label: string | null
  url: string
  caption: string | null
}

interface Pack {
  name: string
  description: string | null
  client_label: string | null
  items: Item[]
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i
const PDF_EXT_RE = /\.pdf(\?.*)?$/i
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i

function classify(url: string): 'image' | 'pdf' | 'video' | 'link' {
  if (IMAGE_EXT_RE.test(url)) return 'image'
  if (PDF_EXT_RE.test(url)) return 'pdf'
  if (VIDEO_EXT_RE.test(url)) return 'video'
  return 'link'
}

export default function SamplePackPublicPage({ params }: { params: { token: string } }) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/public/sample-packs/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data?.error || (r.status === 404 ? 'Share link not found' : 'Could not load this share link'))
        }
        return r.json()
      })
      .then((data) => setPack(data.pack))
      .catch((e) => setError(e.message || 'Could not load this share link'))
      .finally(() => setLoading(false))
  }, [params.token])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-sm text-zinc-500">Loading…</div>
      </div>
    )
  }

  if (error || !pack) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3 opacity-40">🔗</div>
          <h1 className="text-lg font-semibold text-zinc-900 mb-1">Link unavailable</h1>
          <p className="text-sm text-zinc-500">{error || 'This share link is no longer valid.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" className="h-7" />
          {pack.client_label && (
            <div className="text-xs text-zinc-500">
              For <span className="font-medium text-zinc-700">{pack.client_label}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{pack.name}</h1>
          {pack.description && (
            <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap">{pack.description}</p>
          )}
        </div>

        {pack.items.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 py-16 text-center">
            <div className="text-sm text-zinc-500">No examples in this pack yet.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {pack.items.map((item) => {
              const kind = classify(item.url)
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-white ring-1 ring-zinc-200 hover:ring-[#0A52EF]/40 hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.18)] transition-all overflow-hidden"
                >
                  {kind === 'image' && (
                    <div className="bg-zinc-100">
                      <img src={item.url} alt={item.label || ''} className="w-full max-h-[600px] object-contain" />
                    </div>
                  )}
                  {kind === 'video' && (
                    <video src={item.url} controls className="w-full max-h-[600px] bg-black" />
                  )}
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900">
                        {item.label || stripUrl(item.url)}
                      </div>
                      {item.caption && (
                        <div className="text-xs text-zinc-500 mt-1">{item.caption}</div>
                      )}
                      <div className="text-[11px] text-zinc-400 mt-1.5 truncate">{item.url}</div>
                    </div>
                    <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                      {kind}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        <footer className="mt-12 text-center text-[11px] text-zinc-400">
          Shared via ANC Sports
        </footer>
      </main>
    </div>
  )
}

function stripUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.split('/').filter(Boolean).pop() || u.host
  } catch {
    return url
  }
}
