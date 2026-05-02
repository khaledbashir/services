'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { VoiceCallWidget } from '@/components/voice-call-widget'

interface KbDocument {
  id: string
  type: 'file' | 'url' | 'text'
  name: string
  source: string
  url?: string
  addedAt: string
}

interface VoiceAgent {
  id: string
  slug: string
  name: string
  description: string | null
  systemPrompt: string | null
  kbText: string | null
  ttsProvider: string
  ttsVoice: string
  ttsModel: string | null
  llmProvider: string | null
  visibility: 'internal' | 'public'
  embedOrigins: string[] | null
  greeting: string | null
  isActive: boolean
  allmWorkspaceSlug: string | null
  kbDocuments: KbDocument[]
}

const TTS_VOICE_OPTIONS: Record<string, string[]> = {
  mimo: ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean', '冰糖', '茉莉', '苏打', '白桦'],
  elevenlabs: [],
  openai: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'],
  gemini: ['Charon', 'Aoede', 'Fenrir', 'Kore', 'Orus', 'Puck'],
}

type Tab = 'call' | 'share' | 'embed' | 'settings'

export default function VoiceAgentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [agent, setAgent] = useState<VoiceAgent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('call')

  useEffect(() => {
    fetch(`/api/voice-agents/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAgent(data.agent)
        else setError(data.error || 'Failed to load agent')
      })
      .catch(err => setError(String(err)))
  }, [params.id])

  if (error) {
    return (
      <DashboardLayout>
        <main className="mx-auto max-w-3xl px-5 py-10">
          <Link href="/voice-agents" className="text-sm text-[#0A52EF] hover:underline">
            ← Back to voice agents
          </Link>
          <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
        </main>
      </DashboardLayout>
    )
  }

  if (!agent) {
    return (
      <DashboardLayout>
        <main className="mx-auto max-w-3xl px-5 py-10 text-sm text-zinc-500">Loading…</main>
      </DashboardLayout>
    )
  }

  const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''
  const callUrl = `${baseUrl}/voice-agents/${agent.slug}`
  const embedUrl = `${baseUrl}/voice-agents/${agent.slug}/embed`
  const iframeSnippet = `<iframe src="${embedUrl}" width="420" height="640" allow="microphone" style="border:0;border-radius:12px" title="${agent.name}"></iframe>`

  const onPatch = async (patch: Partial<VoiceAgent>) => {
    const res = await fetch(`/api/voice-agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (data.ok) setAgent(data.agent)
  }

  const onDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This is permanent.`)) return
    const res = await fetch(`/api/voice-agents/${agent.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/voice-agents')
  }

  return (
    <DashboardLayout>
      <main className="min-h-full bg-[var(--anc-page)] text-[var(--anc-text)]">
        <div className="mx-auto max-w-6xl px-5 py-6">
          <Link href="/voice-agents" className="text-xs text-zinc-500 hover:text-[#0A52EF]">
            ← All voice agents
          </Link>
          <header className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">{agent.name}</h1>
              <p className="mt-1 font-mono text-xs text-zinc-500">{agent.slug}</p>
              {agent.description && (
                <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">{agent.description}</p>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                agent.visibility === 'public'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
              }`}
            >
              {agent.visibility}
            </span>
          </header>

          <nav className="mt-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {(['call', 'share', 'embed', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px ${
                  tab === t
                    ? 'border-[#0A52EF] text-[#0A52EF]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <section className="mt-5">
            {tab === 'call' && (
              <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <VoiceCallWidget agentRef={agent.slug} agentName={agent.name} greeting={agent.greeting} />
              </div>
            )}

            {tab === 'share' && (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="text-base font-bold">Share link</h2>
                <p className="text-sm text-zinc-500">
                  {agent.visibility === 'internal'
                    ? 'Anyone with this link AND a logged-in ANC services account can use this agent.'
                    : 'This agent is public — anyone with the link can use it. (Public mode auth gate is being finalized.)'}
                </p>
                <CopyRow value={callUrl} />
              </div>
            )}

            {tab === 'embed' && (
              <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <h2 className="text-base font-bold">Embed iframe</h2>
                  <p className="text-sm text-zinc-500">
                    Drop this into any HTML page. The browser asks the visitor to allow microphone the first time.
                  </p>
                </div>
                <CopyRow value={iframeSnippet} multi />
                <div>
                  <h3 className="text-sm font-bold">Direct embed URL</h3>
                  <CopyRow value={embedUrl} />
                </div>
                <p className="text-xs text-zinc-500">
                  For internal-only agents, the embedding page must already have the staff cookie (e.g. another page on services.ancsports.net).
                </p>
              </div>
            )}

            {tab === 'settings' && (
              <SettingsForm agent={agent} onSave={onPatch} onDelete={onDelete} />
            )}
          </section>
        </div>
      </main>
    </DashboardLayout>
  )
}

function CopyRow({ value, multi = false }: { value: string; multi?: boolean }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex gap-2">
      {multi ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
        />
      ) : (
        <input
          readOnly
          value={value}
          className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
        />
      )}
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function SettingsForm({
  agent,
  onSave,
  onDelete,
}: {
  agent: VoiceAgent
  onSave: (patch: Partial<VoiceAgent>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description || '')
  const [greeting, setGreeting] = useState(agent.greeting || '')
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt || '')
  const [kbText, setKbText] = useState(agent.kbText || '')
  const [ttsProvider, setTtsProvider] = useState(agent.ttsProvider)
  const [ttsVoice, setTtsVoice] = useState(agent.ttsVoice)
  const [visibility, setVisibility] = useState(agent.visibility)
  const [saving, setSaving] = useState(false)

  const voiceOptions = TTS_VOICE_OPTIONS[ttsProvider] || []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({
      name,
      description: description || null,
      greeting: greeting || null,
      systemPrompt: systemPrompt || null,
      kbText: kbText || null,
      ttsProvider,
      ttsVoice,
      visibility,
    } as Partial<VoiceAgent>)
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Spoken greeting" hint="Played the first time the user starts a conversation. Leave blank to skip.">
        <input value={greeting} onChange={(e) => setGreeting(e.target.value)} className={inputCls} placeholder="ANC Ops here. What do you need?" />
      </Field>
      <Field label="System prompt" hint="Custom instructions appended to the voice system prompt — persona, rules, what to say or avoid.">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className={inputCls}
          placeholder="You are the receptionist for ANC Sports. Always confirm the venue before creating a ticket…"
        />
      </Field>
      <Field label="Knowledge base — inline notes" hint="Plain text the agent always sees. Use for short, always-relevant rules. Bigger reference material → upload as a file or URL below.">
        <textarea
          value={kbText}
          onChange={(e) => setKbText(e.target.value)}
          rows={5}
          className={inputCls}
          placeholder="ANC team:&#10;- Joe Occhipinti runs ops; route urgent escalations to him.&#10;- Charlie Dinh runs IT; tech-platform issues go to him.&#10;- Default ticket assignee for non-critical issues: ops queue."
        />
      </Field>

      <KbAttachments agent={agent} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="TTS provider">
          <select
            value={ttsProvider}
            onChange={(e) => {
              setTtsProvider(e.target.value)
              const next = TTS_VOICE_OPTIONS[e.target.value]
              if (next && next.length > 0) setTtsVoice(next[0])
            }}
            className={inputCls}
          >
            {Object.keys(TTS_VOICE_OPTIONS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Voice">
          {voiceOptions.length > 0 ? (
            <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} className={inputCls}>
              {voiceOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} className={inputCls} placeholder="voice id" />
          )}
        </Field>
      </div>
      <Field label="Visibility">
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={visibility === 'internal'} onChange={() => setVisibility('internal')} />
            Internal
          </label>
          <label className="flex items-center gap-2 opacity-60">
            <input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} disabled />
            Public (coming next)
          </label>
        </div>
      </Field>

      <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs font-semibold text-rose-600 hover:underline"
        >
          Delete agent
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

function KbAttachments({ agent }: { agent: VoiceAgent }) {
  const [docs, setDocs] = useState<KbDocument[]>(agent.kbDocuments || [])
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const refresh = async () => {
    const res = await fetch(`/api/voice-agents/${agent.id}/kb`)
    const data = await res.json()
    if (data.ok) setDocs(data.documents || [])
  }

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    setStatus(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`)
    try {
      const form = new FormData()
      for (const f of files) form.append('file', f)
      const res = await fetch(`/api/voice-agents/${agent.id}/kb`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `upload failed (${res.status})`)
      setDocs(data.documents || [])
      setStatus(`Added ${(data.added || []).length} document${(data.added || []).length === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const addUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = url.trim()
    if (!cleaned) return
    setBusy(true)
    setError(null)
    setStatus(`Scraping ${cleaned}…`)
    try {
      const res = await fetch(`/api/voice-agents/${agent.id}/kb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleaned }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `url ingest failed (${res.status})`)
      setDocs(data.documents || [])
      setUrl('')
      setStatus(`Added ${(data.added || []).length} document${(data.added || []).length === 1 ? '' : 's'} from URL.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const removeDoc = async (docId: string) => {
    if (!confirm('Remove this document from the agent\'s knowledge base?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/voice-agents/${agent.id}/kb`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `remove failed (${res.status})`)
      setDocs(data.documents || [])
      setStatus('Document removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Knowledge files & URLs
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Drop files (PDF, DOCX, TXT, MD) or paste a URL. Content is embedded into a searchable knowledge base — the agent retrieves the most relevant chunks during every voice turn.
        </p>
      </div>

      <div
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragActive(false)
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
        }}
        className={[
          'rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition',
          dragActive
            ? 'border-[#0A52EF] bg-[#0A52EF]/10 text-[#0A52EF]'
            : 'border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400',
        ].join(' ')}
      >
        <p className="font-semibold">Drag & drop files here</p>
        <p className="mt-1 text-xs">or</p>
        <label className="mt-2 inline-block cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
          Browse files
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      <form onSubmit={addUrl} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.example.com/policy"
          className={inputCls}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-md bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add URL
        </button>
      </form>

      {(status || error) && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            error
              ? 'border border-rose-300 bg-rose-50 text-rose-800'
              : 'border border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || status}
        </div>
      )}

      {docs.length > 0 ? (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                  {d.type === 'url' ? '🔗 ' : '📄 '}
                  {d.name}
                </p>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-mono text-[11px] text-zinc-500 hover:text-[#0A52EF]"
                  >
                    {d.url}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeDoc(d.id)}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">No documents attached yet.</p>
      )}

      <p className="text-[11px] text-zinc-500">
        Powered by AnythingLLM workspace <code className="font-mono">{agent.allmWorkspaceSlug || 'created on first upload'}</code>. Refreshing the page also refetches the latest list — <button type="button" onClick={() => void refresh()} className="underline">refresh now</button>.
      </p>
    </div>
  )
}
