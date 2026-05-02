'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface VoiceAgent {
  id: string
  slug: string
  name: string
  description: string | null
  visibility: 'internal' | 'public'
  ttsProvider: string
  ttsVoice: string
  isActive: boolean
}

export default function VoiceAgentsListPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<VoiceAgent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'internal' | 'public'>('internal')

  useEffect(() => {
    fetch('/api/voice-agents')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAgents(data.agents)
        else setError(data.error || 'Failed to load agents')
      })
      .catch(err => setError(String(err)))
  }, [])

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, visibility }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `failed (${res.status})`)
      router.push(`/voice-agents/${data.agent.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <main className="min-h-full bg-[var(--anc-page)] text-[var(--anc-text)]">
        <div className="mx-auto max-w-5xl px-5 py-6">
          <header className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Voice agents</p>
              <h1 className="mt-1 text-2xl font-black">All voice agents</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Build voice-driven assistants on top of the ANC services platform. Each agent has its own prompt, knowledge base, voice, and shareable link or embed snippet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(v => !v)}
              className="rounded-md bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0840C0]"
            >
              {showForm ? 'Cancel' : 'New agent'}
            </button>
          </header>

          {showForm && (
            <form
              onSubmit={createAgent}
              className="mb-6 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Service Receptionist"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One sentence — what this agent is for."
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Visibility</label>
                <div className="mt-1 flex gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility === 'internal'}
                      onChange={() => setVisibility('internal')}
                    />
                    Internal — staff login required
                  </label>
                  <label className="flex items-center gap-2 opacity-60">
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility === 'public'}
                      onChange={() => setVisibility('public')}
                      disabled
                    />
                    Public (open via share link) — coming next
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!name.trim() || creating}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {creating ? 'Creating…' : 'Create agent'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setName(''); setDescription('') }}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          {!agents && !error && <p className="text-sm text-zinc-500">Loading…</p>}

          {agents && agents.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
              No voice agents yet. Create your first one above.
            </div>
          )}

          {agents && agents.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/voice-agents/${agent.slug}`}
                  className="group block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-[#0A52EF]/40 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-[#0A52EF]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-zinc-950 group-hover:text-[#0A52EF] dark:text-zinc-100">
                        {agent.name}
                      </h3>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{agent.slug}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        agent.visibility === 'public'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {agent.visibility}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{agent.description}</p>
                  )}
                  <p className="mt-3 text-xs text-zinc-500">
                    {agent.ttsProvider} · {agent.ttsVoice}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  )
}
