'use client'

/**
 * Release Kit — drop in a press release or a page of notes, get back the whole
 * announcement: what is missing from the source, the story, the social set, the
 * partner email, ad copy inside publisher caps, and an internal note.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Copy, FileText,
  History, Loader2, Sparkles, Upload,
} from 'lucide-react'

const AD_LIMITS = { sponsor: 25, headline: 95, body: 255, cta: 25 } as const

type Gap = { severity: 'blocker' | 'check'; title: string; detail: string; quote?: string }
type Kit = {
  title: string
  summary: string
  facts: string[]
  gaps: Gap[]
  story: { headline: string; dek: string; paragraphs: string[] }
  social: { linkedinCompany: string; linkedinExec: string; shortForm: string }
  email: { subject: string; previewText: string; body: string }
  adCopy: { sponsor: string; headline: string; body: string; cta: string }
  internalNote: string
  suggestedAudience: string
}
type RunSummary = {
  id: string; title: string; summary: string; source_name: string | null
  gap_count: number; blocker_count: number; created_by: string | null; created_at: string
}
type Audience = { id: string; name: string; member_count?: number }

const panel = 'rounded-xl border border-zinc-200 bg-white shadow-sm'
const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-md bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-50'
const ghostBtn = 'inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50'

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={ghostBtn}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        })
      }}
    >
      {done ? <ClipboardCheck className="size-4 text-emerald-600" /> : <Copy className="size-4 text-zinc-400" />}
      {done ? 'Copied' : label}
    </button>
  )
}

function Block({ title, hint, body, children }: {
  title: string; hint?: string; body?: string; children?: React.ReactNode
}) {
  return (
    <div className={panel}>
      <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {hint && <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-zinc-400">{hint}</span>}
      </div>
      <div className="px-5 py-4">
        {body !== undefined && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{body}</p>
        )}
        {children}
      </div>
      {body !== undefined && (
        <div className="border-t border-zinc-100 px-5 py-3">
          <CopyButton text={body} />
        </div>
      )}
    </div>
  )
}

function CharCount({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit
  return (
    <span className={`text-[11px] font-medium ${over ? 'text-red-600' : 'text-zinc-400'}`}>
      {value.length}/{limit}
    </span>
  )
}

export default function ReleaseKitPage() {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kit, setKit] = useState<Kit | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [audienceId, setAudienceId] = useState('')
  const [draftMsg, setDraftMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadRuns = useCallback(() => {
    fetch('/api/marketing/release/runs')
      .then(r => r.json())
      .then(d => setRuns(d.runs || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadRuns()
    fetch('/api/marketing/audiences')
      .then(r => r.json())
      .then(d => setAudiences(d.audiences || []))
      .catch(() => {})
  }, [loadRuns])

  // Pre-select the list the model suggested, when it matches a real one.
  useEffect(() => {
    if (!kit?.suggestedAudience || audienceId) return
    // The suggestion often arrives with the size appended, e.g. "Media & Partnerships
    // Newsletter (4,235 contacts)" — match on the name part.
    const wanted = kit.suggestedAudience.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
    const match = audiences.find(a => a.name.toLowerCase() === wanted)
      || audiences.find(a => a.name.toLowerCase().includes(wanted) && wanted.length > 6)
    if (match) setAudienceId(match.id)
  }, [kit, audiences, audienceId])

  function pickFile(f: File | null) {
    setFile(f)
    setFileName(f ? f.name : null)
    setError('')
  }

  async function generate() {
    setBusy(true); setError(''); setKit(null); setRunId(null); setDraftMsg('')
    try {
      let res: Response
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        if (text.trim()) fd.append('text', text.trim())
        res = await fetch('/api/marketing/release/generate', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/marketing/release/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setKit(data.kit); setRunId(data.id); loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function openRun(id: string) {
    setBusy(true); setError(''); setDraftMsg('')
    try {
      const res = await fetch(`/api/marketing/release/runs/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open that one')
      setKit(data.run.kit); setRunId(data.run.id)
      setText(data.run.source_text || '')
      setFileName(data.run.source_name || null); setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that one')
    } finally {
      setBusy(false)
    }
  }

  async function createDraft() {
    if (!kit) return
    setDraftMsg('')
    try {
      const bodyHtml = kit.email.body
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
        .join('')
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: kit.title,
          subject: kit.email.subject,
          previewText: kit.email.previewText,
          bodyHtml,
          audienceId: audienceId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create the draft')
      setDraftMsg('Draft created — it is waiting in Newsletters.')
    } catch (err) {
      setDraftMsg(err instanceof Error ? err.message : 'Could not create the draft')
    }
  }

  const blockers = kit?.gaps.filter(g => g.severity === 'blocker') || []
  const checks = kit?.gaps.filter(g => g.severity === 'check') || []

  return (
    <DashboardLayout>
      <div className="space-y-5 text-zinc-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/marketing-hub" className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-700">
              <ArrowLeft className="size-3.5" /> Marketing
            </Link>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Release Kit</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Drop in a press release or a page of notes. You get back what is missing from it, the
              story, the posts, the partner email, and ad copy that already fits the character limits.
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {/* ---------- input ---------- */}
            <div className={panel}>
              <div className="border-b border-zinc-100 px-5 py-3.5">
                <h2 className="text-sm font-semibold">What are we announcing?</h2>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragging(false)
                    pickFile(e.dataTransfer.files?.[0] || null)
                  }}
                  onClick={() => fileInput.current?.click()}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 transition-colors ${
                    dragging ? 'border-[#0A52EF] bg-blue-50/60' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {fileName
                    ? <FileText className="size-5 shrink-0 text-[#0A52EF]" />
                    : <Upload className="size-5 shrink-0 text-zinc-400" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800">
                      {fileName || 'Drop the document here, or click to choose'}
                    </p>
                    <p className="text-xs text-zinc-500">Word documents and text files. Or just paste below.</p>
                  </div>
                  {fileName && (
                    <button
                      type="button"
                      className="ml-auto shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                      onClick={e => { e.stopPropagation(); pickFile(null) }}
                    >Remove</button>
                  )}
                </div>
                <input
                  ref={fileInput} type="file" className="hidden"
                  accept=".docx,.txt,.md,.rtf"
                  onChange={e => pickFile(e.target.files?.[0] || null)}
                />

                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={10}
                  placeholder="…or paste the release, the notes, or even a rough email here."
                  className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button className={primaryBtn} onClick={generate} disabled={busy || (!file && text.trim().length < 80)}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {busy ? 'Reading it…' : 'Build the kit'}
                  </button>
                  <span className="text-xs text-zinc-500">Takes up to a minute. Nothing is sent anywhere.</span>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ---------- results ---------- */}
            {kit && (
              <div className="space-y-5">
                <div className={panel}>
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Reading of the source</p>
                    <h2 className="mt-1 text-lg font-semibold">{kit.title}</h2>
                    {kit.summary && <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{kit.summary}</p>}
                  </div>
                </div>

                {/* gaps first — this is the part that saves everyone */}
                <div className={panel}>
                  <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
                    <h3 className="text-sm font-semibold">What is missing or worth checking</h3>
                    <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      {blockers.length} to fix · {checks.length} to confirm
                    </span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {kit.gaps.length === 0 && (
                      <div className="flex items-center gap-2 px-5 py-4 text-sm text-zinc-600">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        Nothing obviously missing.
                      </div>
                    )}
                    {[...blockers, ...checks].map((g, i) => (
                      <div key={i} className="flex gap-3 px-5 py-4">
                        <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          g.severity === 'blocker' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>{g.severity === 'blocker' ? '!' : '?'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{g.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-zinc-600">{g.detail}</p>
                          {g.quote && (
                            <p className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-600">
                              {g.quote}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Block title="The story" hint="Newsroom">
                  <h4 className="text-lg font-semibold leading-snug">{kit.story.headline}</h4>
                  {kit.story.dek && <p className="mt-2 text-sm leading-relaxed text-zinc-600">{kit.story.dek}</p>}
                  <div className="mt-3 space-y-3">
                    {kit.story.paragraphs.map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed text-zinc-700">{p}</p>
                    ))}
                  </div>
                  <div className="mt-4">
                    <CopyButton
                      label="Copy story"
                      text={[kit.story.headline, kit.story.dek, ...kit.story.paragraphs].filter(Boolean).join('\n\n')}
                    />
                  </div>
                </Block>

                <div className="grid gap-5 md:grid-cols-2">
                  <Block title="LinkedIn — company page" hint="Post" body={kit.social.linkedinCompany} />
                  <Block title="LinkedIn — leader's own account" hint="First person" body={kit.social.linkedinExec} />
                </div>

                <Block title="Short post" hint="X / Threads" body={kit.social.shortForm} />

                <div className={panel}>
                  <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
                    <h3 className="text-sm font-semibold">Partner email</h3>
                    <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-zinc-400">Ready to send</span>
                  </div>
                  <div className="space-y-3 px-5 py-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Subject</p>
                      <p className="mt-1 text-sm font-medium text-zinc-900">{kit.email.subject}</p>
                    </div>
                    {kit.email.previewText && (
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Preview line</p>
                        <p className="mt-1 text-sm text-zinc-600">{kit.email.previewText}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Body</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{kit.email.body}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-5 py-3">
                    <CopyButton text={`${kit.email.subject}\n\n${kit.email.body}`} label="Copy email" />
                    <select
                      value={audienceId}
                      onChange={e => setAudienceId(e.target.value)}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-800 outline-none focus:border-[#0A52EF]"
                    >
                      <option value="">Choose a list…</option>
                      {audiences.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.member_count != null ? ` (${a.member_count.toLocaleString()})` : ''}
                        </option>
                      ))}
                    </select>
                    <button className={primaryBtn} onClick={createDraft}>Create newsletter draft</button>
                    {draftMsg && <span className="text-sm text-zinc-600">{draftMsg}</span>}
                  </div>
                </div>

                <div className={panel}>
                  <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
                    <h3 className="text-sm font-semibold">Ad copy</h3>
                    <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-zinc-400">Within publisher limits</span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {([
                      ['Sponsor', kit.adCopy.sponsor, AD_LIMITS.sponsor],
                      ['Headline', kit.adCopy.headline, AD_LIMITS.headline],
                      ['Body', kit.adCopy.body, AD_LIMITS.body],
                      ['Call to action', kit.adCopy.cta, AD_LIMITS.cta],
                    ] as const).map(([label, value, limit]) => (
                      <div key={label} className="flex items-start gap-3 px-5 py-3">
                        <span className="w-28 shrink-0 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{label}</span>
                        <p className="min-w-0 flex-1 text-sm text-zinc-800">{value}</p>
                        <CharCount value={value} limit={limit} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 border-t border-zinc-100 px-5 py-3">
                    <CopyButton
                      label="Copy ad copy"
                      text={`Sponsor: ${kit.adCopy.sponsor}\nHeadline: ${kit.adCopy.headline}\nBody: ${kit.adCopy.body}\nCTA: ${kit.adCopy.cta}`}
                    />
                    <Link href="/marketing-hub/creative" className={ghostBtn}>Build the artwork</Link>
                  </div>
                </div>

                <Block title="Note to staff" hint="Internal" body={kit.internalNote} />

                {kit.facts.length > 0 && (
                  <div className={panel}>
                    <div className="border-b border-zinc-100 px-5 py-3.5">
                      <h3 className="text-sm font-semibold">Every fact this was built from</h3>
                    </div>
                    <ul className="space-y-2 px-5 py-4">
                      {kit.facts.map((f, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-300" />{f}
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
                      Nothing above was invented. If a detail is not on this list, it was not in what you supplied.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---------- history ---------- */}
          <aside className="space-y-3">
            <div className={panel}>
              <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <History className="size-4 text-zinc-400" />
                <h2 className="text-sm font-semibold">Earlier kits</h2>
              </div>
              <div className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto">
                {runs.length === 0 && (
                  <p className="px-4 py-4 text-sm text-zinc-500">Nothing yet. Your first one will appear here.</p>
                )}
                {runs.map(r => (
                  <button
                    key={r.id}
                    onClick={() => openRun(r.id)}
                    className={`block w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${
                      runId === r.id ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-zinc-900">{r.title || 'Untitled'}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{r.summary}</p>
                    <p className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
                      <span>{new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {r.blocker_count > 0 && <span className="text-red-600">{r.blocker_count} to fix</span>}
                      {r.source_name && <span className="truncate">{r.source_name}</span>}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
