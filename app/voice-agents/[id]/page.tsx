'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { VoiceCallWidget } from '@/components/voice-call-widget'

interface ToolNode {
  name: string
  description: string
  category?: string
  role?: string
  icon?: string
}

interface SubgroupNode {
  key: string
  label: string
  description?: string
  comingSoon?: boolean
  tools: ToolNode[]
}

interface GroupNode {
  key: 'anc' | 'general'
  label: string
  description: string
  subgroups: SubgroupNode[]
}

interface KbDocument {
  id: string
  type: 'file' | 'url' | 'text'
  name: string
  source: string
  url?: string
  addedAt: string
}

interface AvailableProvider {
  name: string
  label: string
  model: string
  availableModels: string[]
  featured?: boolean
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
  llmModel: string | null
  allowedTools: string[] | null
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

type Tab = 'call' | 'history' | 'share' | 'embed' | 'settings'

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
            {(['call', 'history', 'share', 'embed', 'settings'] as Tab[]).map((t) => (
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

            {tab === 'history' && (
              <AgentHistory agentSlug={agent.slug} />
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
  const [llmProvider, setLlmProvider] = useState(agent.llmProvider || '')
  const [llmModel, setLlmModel] = useState(agent.llmModel || '')
  const [llmProviders, setLlmProviders] = useState<AvailableProvider[]>([])
  // Tool permissions: null = all tools (default for legacy agents), otherwise
  // explicit allowlist. We keep a Set for fast checkbox state.
  const [toolMode, setToolMode] = useState<'all' | 'custom'>(
    agent.allowedTools === null || agent.allowedTools === undefined ? 'all' : 'custom'
  )
  const [allowedTools, setAllowedTools] = useState<Set<string>>(
    new Set(agent.allowedTools || [])
  )
  const [visibility, setVisibility] = useState(agent.visibility)
  const [saving, setSaving] = useState(false)

  const voiceOptions = TTS_VOICE_OPTIONS[ttsProvider] || []
  const selectedLlm = llmProviders.find((p) => p.name === llmProvider) || null
  const llmModelOptions = selectedLlm?.availableModels || (selectedLlm ? [selectedLlm.model] : [])

  useEffect(() => {
    fetch('/api/ai/providers')
      .then((r) => r.json())
      .then((data) => setLlmProviders(data.providers || []))
      .catch(() => setLlmProviders([]))
  }, [])

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
      llmProvider: llmProvider || null,
      llmModel: llmModel || null,
      allowedTools: toolMode === 'all' ? null : Array.from(allowedTools),
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
          placeholder="ANC team:&#10;- Operations lead owns urgent service escalations.&#10;- Technical lead owns platform and integration issues.&#10;- Default ticket assignee for non-critical issues: ops queue."
        />
      </Field>

      <KbAttachments agent={agent} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="LLM provider" hint="Brain that runs the conversation. Mercury = ultra-fast voice-tuned reasoning. MiMo = cheap general. Default = global pool.">
          <select
            value={llmProvider}
            onChange={(e) => {
              setLlmProvider(e.target.value)
              const next = llmProviders.find((p) => p.name === e.target.value)
              setLlmModel(next?.model || '')
            }}
            className={inputCls}
          >
            <option value="">Default (global pool)</option>
            {llmProviders.filter(p => p.featured).length > 0 && (
              <optgroup label="Featured for voice">
                {llmProviders.filter(p => p.featured).map((p) => (
                  <option key={p.name} value={p.name}>{p.label} ({p.model})</option>
                ))}
              </optgroup>
            )}
            {llmProviders.filter(p => !p.featured).length > 0 && (
              <optgroup label="All providers">
                {llmProviders.filter(p => !p.featured).map((p) => (
                  <option key={p.name} value={p.name}>{p.label} ({p.model})</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="LLM model" hint="Specific model on the chosen provider. Leave on default unless you know you want a different one.">
          {llmProvider && llmModelOptions.length > 0 ? (
            <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)} className={inputCls}>
              {llmModelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className={inputCls}
              placeholder={llmProvider ? 'model id' : 'auto — uses provider default'}
              disabled={!llmProvider}
            />
          )}
        </Field>
      </div>

      <ToolPermissionsTree
        mode={toolMode}
        setMode={setToolMode}
        allowed={allowedTools}
        setAllowed={setAllowedTools}
      />

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

function ToolPermissionsTree({
  mode,
  setMode,
  allowed,
  setAllowed,
}: {
  mode: 'all' | 'custom'
  setMode: (m: 'all' | 'custom') => void
  allowed: Set<string>
  setAllowed: (s: Set<string>) => void
}) {
  const [groups, setGroups] = useState<GroupNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ anc: true, general: false })
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/voice-agents/tool-tree')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setGroups(data.groups || [])
        else setError(data.error || 'Failed to load tools')
      })
      .catch((err) => setError(String(err)))
  }, [])

  const toggleTool = (name: string) => {
    const next = new Set(allowed)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setAllowed(next)
  }

  const toggleSubgroup = (sub: SubgroupNode) => {
    const subToolNames = sub.tools.map((t) => t.name)
    const allChecked = subToolNames.every((n) => allowed.has(n))
    const next = new Set(allowed)
    if (allChecked) {
      for (const n of subToolNames) next.delete(n)
    } else {
      for (const n of subToolNames) next.add(n)
    }
    setAllowed(next)
  }

  const toggleGroup = (group: GroupNode) => {
    const all = group.subgroups.flatMap((s) => s.tools.map((t) => t.name))
    const allChecked = all.length > 0 && all.every((n) => allowed.has(n))
    const next = new Set(allowed)
    if (allChecked) {
      for (const n of all) next.delete(n)
    } else {
      for (const n of all) next.add(n)
    }
    setAllowed(next)
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tool permissions</p>
        <p className="mt-1 text-xs text-zinc-500">
          Restrict which capabilities this agent can call. Default is full access; switch to custom to lock the agent down to a curated set.
        </p>
      </div>

      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
          All tools (full access)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} />
          Custom — pick from the tree below
        </label>
      </div>

      {mode === 'custom' && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>
          )}
          {!groups && !error && <p className="text-xs text-zinc-500">Loading tools…</p>}
          {groups && groups.length > 0 && (
            <div className="space-y-2">
              {groups.map((group) => {
                const groupTools = group.subgroups.flatMap((s) => s.tools.map((t) => t.name))
                const groupAllChecked = groupTools.length > 0 && groupTools.every((n) => allowed.has(n))
                const groupSomeChecked = groupTools.some((n) => allowed.has(n))
                const isOpen = !!openGroups[group.key]
                return (
                  <div key={group.key} className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-2 bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
                      <button
                        type="button"
                        onClick={() => setOpenGroups({ ...openGroups, [group.key]: !isOpen })}
                        className="flex flex-1 items-center gap-2 text-left text-sm font-bold"
                      >
                        <span className="text-xs">{isOpen ? '▼' : '▶'}</span>
                        <span>{group.label}</span>
                        <span className="text-xs font-normal text-zinc-500">({groupTools.length} tools)</span>
                      </button>
                      <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={groupAllChecked}
                          ref={(el) => { if (el) el.indeterminate = !groupAllChecked && groupSomeChecked }}
                          onChange={() => toggleGroup(group)}
                          disabled={groupTools.length === 0}
                        />
                        Select all
                      </label>
                    </div>
                    {isOpen && (
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {group.subgroups.map((sub) => {
                          const subToolNames = sub.tools.map((t) => t.name)
                          const allSubChecked = subToolNames.length > 0 && subToolNames.every((n) => allowed.has(n))
                          const someSubChecked = subToolNames.some((n) => allowed.has(n))
                          const subOpen = !!openSubs[sub.key]
                          return (
                            <div key={sub.key} className="bg-white dark:bg-zinc-900">
                              <div className="flex items-center justify-between gap-2 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setOpenSubs({ ...openSubs, [sub.key]: !subOpen })}
                                  className="flex flex-1 items-center gap-2 text-left"
                                  disabled={sub.tools.length === 0}
                                >
                                  <span className="text-xs">{subOpen ? '▼' : '▶'}</span>
                                  <div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                      {sub.label}
                                      {sub.comingSoon && (
                                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                          Coming soon
                                        </span>
                                      )}
                                    </p>
                                    {sub.description && (
                                      <p className="text-[11px] text-zinc-500">{sub.description}</p>
                                    )}
                                  </div>
                                  <span className="ml-auto text-xs text-zinc-500">{sub.tools.length}</span>
                                </button>
                                <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                                  <input
                                    type="checkbox"
                                    checked={allSubChecked}
                                    ref={(el) => { if (el) el.indeterminate = !allSubChecked && someSubChecked }}
                                    onChange={() => toggleSubgroup(sub)}
                                    disabled={sub.tools.length === 0}
                                  />
                                </label>
                              </div>
                              {subOpen && sub.tools.length > 0 && (
                                <ul className="divide-y divide-zinc-100 bg-zinc-50/40 dark:divide-zinc-800 dark:bg-zinc-900/50">
                                  {sub.tools.map((tool) => (
                                    <li key={tool.name} className="px-5 py-1.5">
                                      <label className="flex items-start gap-2 text-xs">
                                        <input
                                          type="checkbox"
                                          checked={allowed.has(tool.name)}
                                          onChange={() => toggleTool(tool.name)}
                                          className="mt-0.5"
                                        />
                                        <div className="min-w-0">
                                          <p className="font-mono text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                                            {tool.icon ? `${tool.icon} ` : ''}{tool.name}
                                            {tool.role && tool.role !== 'any' && (
                                              <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                                {tool.role}
                                              </span>
                                            )}
                                          </p>
                                          <p className="mt-0.5 truncate text-[11px] text-zinc-600 dark:text-zinc-400">{tool.description}</p>
                                        </div>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-zinc-500">
            {allowed.size} tool{allowed.size === 1 ? '' : 's'} selected. Save the form to apply.
          </p>
        </div>
      )}
    </div>
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

interface HistoryRow {
  id: string
  title: string
  updatedAt: string
  userName: string | null
  messageCount: number
  durationSeconds: number
  status: 'successful' | 'error' | 'empty'
}

function AgentHistory({ agentSlug }: { agentSlug: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetch(`/api/voice-agents/conversations?agent=${encodeURIComponent(agentSlug)}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setRows(data.conversations)
          setTotal(data.total)
        } else {
          setError(data.error || 'Failed to load history')
        }
      })
      .catch((err) => setError(String(err)))
  }, [agentSlug])

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-base font-bold">Recent conversations</h2>
          <p className="text-sm text-zinc-500">
            Last 20 conversations for this agent. Click any row for the full transcript and tool calls.
          </p>
        </div>
        <Link
          href={`/voice-agents/conversations?agent=${encodeURIComponent(agentSlug)}`}
          className="text-xs font-semibold text-[#0A52EF] hover:underline"
        >
          View all ({total}) →
        </Link>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {!rows && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {rows && rows.length === 0 && (
        <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40">
          No conversations yet. Start a call from the Call tab to see history here.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/voice-agents/conversations/${row.id}`}
                className="flex items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{row.title || 'Untitled'}</p>
                  <p className="text-xs text-zinc-500">
                    {row.userName || '—'} · {formatHistoryTime(row.updatedAt)} · {row.messageCount} msg · {formatHistoryDuration(row.durationSeconds)}
                  </p>
                </div>
                <HistoryStatusPill status={row.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryStatusPill({ status }: { status: HistoryRow['status'] }) {
  const cls =
    status === 'successful'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'error'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  const label = status === 'successful' ? 'Successful' : status === 'error' ? 'Error' : 'Empty'
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>
}

function formatHistoryDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatHistoryTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
