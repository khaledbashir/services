'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, ImageIcon, Loader2, Sparkles, Wand2 } from 'lucide-react'

type AdFormat = { id: string; label: string; group: string; width: number; height: number; maxBytes: number; note?: string }
type AdTemplate = { id: string; label: string; description: string }
type LibraryPhoto = { id: string; file: string; label: string; venue: string; mood: string; url: string }
type RenderedFile = { name: string; mime: string; bytes: number; withinCap: boolean; dataUrl: string }

const inputClass =
  'w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20'
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-[#0A52EF] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2B66F6] disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50'
const panelClass = 'rounded-md border border-zinc-800 bg-zinc-950/70'

function formatKb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`
}

function CharCount({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit
  return (
    <span className={`font-mono text-[11px] ${over ? 'text-red-400' : 'text-zinc-500'}`}>
      {value.length}/{limit}
    </span>
  )
}

export function AdCreativeStudio() {
  const [formats, setFormats] = useState<AdFormat[]>([])
  const [templates, setTemplates] = useState<AdTemplate[]>([])
  const [photos, setPhotos] = useState<LibraryPhoto[]>([])
  const [loadError, setLoadError] = useState('')

  const [formatId, setFormatId] = useState('sbj-ad-unit')
  const [customW, setCustomW] = useState('1200')
  const [customH, setCustomH] = useState('628')
  const [templateId, setTemplateId] = useState('spotlight')
  const [photoId, setPhotoId] = useState('levis-touchdown')
  const [photoFocusY, setPhotoFocusY] = useState(40)
  const [animate, setAnimate] = useState(false)

  const [eyebrow, setEyebrow] = useState('Venue Technology Partner')
  const [headline, setHeadline] = useState('The technology behind football’s **biggest moments**')
  const [bodyCopy, setBodyCopy] = useState('')
  const [cta, setCta] = useState('See What’s Possible')
  const [tagline, setTagline] = useState('')
  const [clickUrl, setClickUrl] = useState('https://www.anc.com/')

  const [brief, setBrief] = useState('')
  const [writing, setWriting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [files, setFiles] = useState<RenderedFile[]>([])
  const [renderMeta, setRenderMeta] = useState<{ width: number; height: number; maxBytes: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/marketing/creative/library')
      .then(res => res.json())
      .then(data => {
        setFormats(data.formats || [])
        setTemplates(data.templates || [])
        setPhotos(data.photos || [])
      })
      .catch(() => setLoadError('Could not load the creative library.'))
  }, [])

  const activeFormat = useMemo(() => formats.find(f => f.id === formatId), [formats, formatId])
  const activePhoto = useMemo(() => photos.find(p => p.id === photoId), [photos, photoId])
  const headlinePlain = headline.replace(/\*\*/g, '')

  const writeCopy = useCallback(async () => {
    if (!brief.trim()) return
    setWriting(true)
    setError('')
    try {
      const res = await fetch('/api/marketing/creative/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, venue: activePhoto?.venue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Copy generation failed')
      setEyebrow(data.copy.eyebrow || '')
      setHeadline(data.copy.headline || '')
      setBodyCopy(data.copy.body || '')
      setCta(data.copy.cta || '')
      setTagline(data.copy.tagline || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy generation failed')
    } finally {
      setWriting(false)
    }
  }, [brief, activePhoto])

  const generate = useCallback(async () => {
    setGenerating(true)
    setError('')
    setFiles([])
    try {
      const payload: Record<string, unknown> = {
        formatId,
        template: templateId,
        photoId,
        photoFocusY,
        eyebrow,
        headline,
        cta,
        tagline,
        animate,
      }
      if (formatId === 'custom') {
        payload.width = Number(customW)
        payload.height = Number(customH)
      }
      const res = await fetch('/api/marketing/creative/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Render failed')
      setFiles(data.files || [])
      setRenderMeta({ width: data.width, height: data.height, maxBytes: data.maxBytes })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed')
    } finally {
      setGenerating(false)
    }
  }, [formatId, templateId, photoId, photoFocusY, eyebrow, headline, cta, tagline, animate, customW, customH])

  const groups = useMemo(() => {
    const map = new Map<string, AdFormat[]>()
    for (const f of formats) {
      map.set(f.group, [...(map.get(f.group) || []), f])
    }
    return [...map.entries()]
  }, [formats])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/marketing-hub" className="text-zinc-500 transition-colors hover:text-zinc-300">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-semibold text-zinc-100">Ad Creative Studio</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Publisher-spec display creative from real ANC installs — exact dimensions, file-size caps enforced, copy written to character limits.
          </p>
        </div>
      </div>

      {loadError && <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{loadError}</div>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-4">
          <div className={`${panelClass} p-4`}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Format</div>
            <select className={inputClass} value={formatId} onChange={e => setFormatId(e.target.value)}>
              {groups.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.label} — {f.width}×{f.height}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="custom">Custom size…</option>
            </select>
            {formatId === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <input className={inputClass} value={customW} onChange={e => setCustomW(e.target.value)} placeholder="Width" inputMode="numeric" />
                <span className="text-zinc-600">×</span>
                <input className={inputClass} value={customH} onChange={e => setCustomH(e.target.value)} placeholder="Height" inputMode="numeric" />
              </div>
            )}
            {activeFormat?.note && <p className="mt-2 text-xs text-zinc-500">{activeFormat.note}</p>}
            {activeFormat && (
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                max {formatKb(activeFormat.maxBytes)} · JPG + PNG{animate ? ' + GIF' : ''}
              </p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={animate} onChange={e => setAnimate(e.target.checked)} className="accent-[#0A52EF]" />
              Animated GIF variant
              <span className="text-xs text-zinc-500">(publishers report GIFs out-click static)</span>
            </label>
          </div>

          <div className={`${panelClass} p-4`}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Layout</div>
            <div className="flex flex-col gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    templateId === t.id ? 'border-[#4F7CFF] bg-[#0A52EF]/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">{t.label}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={`${panelClass} p-4`}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Photo — real ANC installs only</div>
            <div className="grid grid-cols-2 gap-2">
              {photos.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPhotoId(p.id)}
                  className={`overflow-hidden rounded-md border transition-colors ${
                    photoId === p.id ? 'border-[#4F7CFF]' : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                  title={p.venue}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label} className="aspect-video w-full object-cover" loading="lazy" />
                  <div className="truncate px-2 py-1 text-left text-[11px] text-zinc-400">{p.label}</div>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Photo framing</span>
                <span className="font-mono text-[11px]">{photoFocusY}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={photoFocusY}
                onChange={e => setPhotoFocusY(Number(e.target.value))}
                className="w-full accent-[#0A52EF]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={`${panelClass} p-4`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Sparkles className="h-3.5 w-3.5 text-[#4F7CFF]" /> Write it for me
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="e.g. Fall football-newsletter campaign aimed at venue partnership leads"
                onKeyDown={e => e.key === 'Enter' && writeCopy()}
              />
              <button className={secondaryButton} onClick={writeCopy} disabled={writing || !brief.trim()}>
                {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Write
              </button>
            </div>
          </div>

          <div className={`${panelClass} flex flex-col gap-3 p-4`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Copy — publisher limits enforced</div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>Eyebrow</span> <CharCount value={eyebrow} limit={30} />
              </div>
              <input className={inputClass} value={eyebrow} onChange={e => setEyebrow(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>Headline · **highlight** for brand-blue accent</span> <CharCount value={headlinePlain} limit={95} />
              </div>
              <input className={inputClass} value={headline} onChange={e => setHeadline(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>Body (native placements — lives beside the image, not on it)</span> <CharCount value={bodyCopy} limit={255} />
              </div>
              <textarea className={`${inputClass} min-h-[70px]`} value={bodyCopy} onChange={e => setBodyCopy(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>CTA</span> <CharCount value={cta} limit={25} />
                </div>
                <input className={inputClass} value={cta} onChange={e => setCta(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>Image tagline (optional)</span> <CharCount value={tagline} limit={30} />
                </div>
                <input className={inputClass} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Cinematic layout only" />
              </div>
              <div>
                <div className="mb-1 text-xs text-zinc-500">Click-through URL</div>
                <input className={inputClass} value={clickUrl} onChange={e => setClickUrl(e.target.value)} />
              </div>
            </div>
            <button className={buttonClass} onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {generating ? 'Rendering…' : 'Generate creative'}
            </button>
            {error && <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>}
          </div>

          {files.length > 0 && renderMeta && (
            <div className={`${panelClass} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Output — {renderMeta.width}×{renderMeta.height}
                </div>
                <div className="font-mono text-[11px] text-zinc-500">cap {formatKb(renderMeta.maxBytes)}</div>
              </div>
              <div className="flex justify-center rounded-md border border-zinc-800 bg-zinc-900/60 p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(files.find(f => f.mime === 'image/gif') || files[0]).dataUrl}
                  alt="Generated creative"
                  width={renderMeta.width}
                  height={renderMeta.height}
                  className="max-w-full shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map(f => (
                  <a key={f.name} href={f.dataUrl} download={f.name} className={secondaryButton}>
                    <Download className="h-4 w-4" />
                    {f.name}
                    <span className={`font-mono text-[11px] ${f.withinCap ? 'text-emerald-400' : 'text-red-400'}`}>{formatKb(f.bytes)}</span>
                  </a>
                ))}
              </div>
              {bodyCopy.trim() && (
                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Copy blocks for the placement</div>
                  <div className="text-zinc-200">{headlinePlain}</div>
                  <div className="mt-1 text-zinc-400">{bodyCopy}</div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">
                    CTA: {cta} → {clickUrl}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
