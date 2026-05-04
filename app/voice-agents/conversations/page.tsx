'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ConversationRow {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  userId: string
  userName: string | null
  userEmail: string | null
  agentId: string
  agentSlug: string
  agentName: string
  messageCount: number
  durationSeconds: number
  status: 'successful' | 'error' | 'empty'
}

interface AgentSummary {
  id: string
  slug: string
  name: string
}

const PAGE_SIZE = 50

export default function VoiceConversationsPage() {
  const [rows, setRows] = useState<ConversationRow[] | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState<'all' | 'self'>('self')
  const [error, setError] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)

  // Pull agent list once for the filter dropdown.
  useEffect(() => {
    fetch('/api/voice-agents?include_inactive=1')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setAgents(data.agents)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (agentFilter) params.set('agent', agentFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (search.trim()) params.set('q', search.trim())
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    fetch(`/api/voice-agents/conversations?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setRows(data.conversations)
          setTotal(data.total)
          setScope(data.scope)
        } else {
          setError(data.error || 'Failed to load conversations')
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [agentFilter, statusFilter, search, offset])

  const showingRange = useMemo(() => {
    if (!rows || rows.length === 0) return null
    const start = offset + 1
    const end = offset + rows.length
    return `${start}–${end} of ${total}`
  }, [rows, offset, total])

  return (
    <DashboardLayout>
      <main className="min-h-full bg-[var(--anc-page)] text-[var(--anc-text)]">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <div className="mb-2">
            <Link href="/voice-agents" className="text-xs text-zinc-500 hover:text-[#0A52EF]">
              ← All voice agents
            </Link>
          </div>

          <header className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Voice agents</p>
              <h1 className="mt-1 text-2xl font-black">Conversation history</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Every voice and text conversation across your agents.{' '}
                {scope === 'all'
                  ? 'You see everyone’s conversations because you have admin access.'
                  : 'You see your own conversations. Admin / tech support sees all.'}
              </p>
            </div>
          </header>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <input
              value={search}
              onChange={(e) => {
                setOffset(0)
                setSearch(e.target.value)
              }}
              placeholder="Search title or agent…"
              className="flex-1 min-w-[200px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={agentFilter}
              onChange={(e) => {
                setOffset(0)
                setAgentFilter(e.target.value)
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.slug}>{a.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setOffset(0)
                setStatusFilter(e.target.value)
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All statuses</option>
              <option value="successful">Successful</option>
              <option value="error">Error</option>
              <option value="empty">Empty</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
          )}

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/60">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Messages</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {loading && rows === null && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Loading…</td></tr>
                  )}
                  {rows && rows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">No conversations yet.</td></tr>
                  )}
                  {rows?.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-4 py-3 font-semibold">
                        <Link href={`/voice-agents/${row.agentSlug}`} className="hover:text-[#0A52EF]">
                          {row.agentName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/voice-agents/conversations/${row.id}`} className="font-medium text-[#0A52EF] hover:underline">
                          {row.title || 'Untitled'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {row.userName || row.userEmail || '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300" title={new Date(row.updatedAt).toLocaleString()}>
                        {formatRelative(row.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{formatDuration(row.durationSeconds)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{row.messageCount}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {rows && rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <p>{showingRange}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0 || loading}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + rows.length >= total || loading}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  )
}

function StatusPill({ status }: { status: ConversationRow['status'] }) {
  const cls =
    status === 'successful'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'error'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  const label = status === 'successful' ? 'Successful' : status === 'error' ? 'Error' : 'Empty'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
