'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'

const CLASSIFICATIONS = [
  { value: 'leadership', label: 'Leadership' },
  { value: 'sales', label: 'Sales & Enterprise' },
  { value: 'design', label: 'Design & Creative' },
  { value: 'operations', label: 'Operations & Field' },
  { value: 'marketing', label: 'Marketing' },
]

type TokenRow = {
  url: string
  personName: string
  personEmail: string
  classification?: string
  viewCount: number
  lastViewedAt: string | null
  createdAt: string
  revokedAt: string | null
}

export default function HubAdminPage() {
  const { isAdmin, loaded } = useAuth('admin')
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [classification, setClassification] = useState('leadership')
  const [minting, setMinting] = useState(false)
  const [justMinted, setJustMinted] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/hub/tokens')
    if (res.ok) setTokens((await res.json()).data || [])
  }, [])

  useEffect(() => {
    if (isAdmin) refresh()
  }, [isAdmin, refresh])

  if (loaded && !isAdmin) {
    return <DashboardLayout><div className="p-8 text-sm text-zinc-500">Admin only.</div></DashboardLayout>
  }

  async function mint() {
    const n = name.trim()
    const e = email.trim()
    if (!n || !e) { setError('Name and email are required.'); return }
    setMinting(true); setError(null)
    try {
      const res = await fetch('/api/hub/tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personName: n, personEmail: e, logins: [], classification }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not mint link.')
      setJustMinted(payload.data.url)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mint link.')
    } finally { setMinting(false) }
  }

  async function mintLeadership() {
    setMinting(true); setError(null)
    try {
      const res = await fetch('/api/hub/tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personName: 'Leadership', personEmail: 'leadership@anc.com', logins: [] }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not mint link.')
      setJustMinted(payload.data.url)
      setName(''); setEmail('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mint link.')
    } finally { setMinting(false) }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-950">Leadership Hub links</h1>
          <p className="mt-1 text-sm text-zinc-500">Mint shareable one-roof links. A name of “Leadership” is the shared link all execs use.</p>
        </div>

        <div className="rounded-md border border-[#E8E8E8] bg-white p-4">
          <button
            type="button"
            onClick={mintLeadership}
            disabled={minting}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0A52EF] px-3 text-xs font-semibold text-white transition hover:bg-[#0A52EF]/90 disabled:opacity-60"
          >
            <Link2 className="h-3.5 w-3.5" /> {minting ? 'Minting…' : 'Mint shared Leadership link'}
          </button>
          <div className="my-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">or a personal link</div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 w-40 rounded-md border border-[#E8E8E8] px-3 text-sm outline-none focus:border-[#0A52EF]" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-9 w-56 rounded-md border border-[#E8E8E8] px-3 text-sm outline-none focus:border-[#0A52EF]" />
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className="h-9 rounded-md border border-[#E8E8E8] bg-white px-2 text-sm text-zinc-700 outline-none focus:border-[#0A52EF]">
              {CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button type="button" onClick={mint} disabled={minting} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF] disabled:opacity-60">
              <Plus className="h-3.5 w-3.5" /> Mint
            </button>
          </div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
          {justMinted ? (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-[#0A52EF]/30 bg-[#0A52EF]/5 px-3 py-2">
              <a href={justMinted} target="_blank" rel="noreferrer" className="flex-1 truncate text-xs font-semibold text-[#0A52EF]">{justMinted}</a>
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(justMinted); setCopied(justMinted) }} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800">
                {copied === justMinted ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </button>
              <a href={justMinted} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-800"><ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-[#E8E8E8] bg-white">
          <div className="border-b border-[#E8E8E8] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Active links</div>
          <div className="divide-y divide-[#F4F4F4]">
            {tokens.map((t) => (
              <div key={t.url} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900">
                    {t.personName} <span className="text-zinc-400">· {t.personEmail}</span>
                    {t.classification && t.classification !== 'leadership' ? (
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {CLASSIFICATIONS.find((c) => c.value === t.classification)?.label || t.classification}
                      </span>
                    ) : null}
                  </div>
                  <a href={t.url} target="_blank" rel="noreferrer" className="truncate text-xs text-[#0A52EF]">{t.url}</a>
                </div>
                <div className="text-right text-[11px] text-zinc-400">
                  <div>{t.viewCount} views</div>
                  <div>{t.lastViewedAt ? new Date(t.lastViewedAt).toLocaleDateString() : 'never opened'}</div>
                </div>
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(t.url); setCopied(t.url) }} className="text-zinc-400 hover:text-zinc-800">
                  {copied === t.url ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
            {tokens.length === 0 ? <div className="px-4 py-6 text-center text-xs text-zinc-400">No links yet.</div> : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}