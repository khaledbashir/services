'use client'

import { NewsletterVisualEditor } from '@/components/marketing/newsletter-visual/NewsletterVisualEditor'
import {
  DEFAULT_NEWSLETTER_VISUAL,
  exportNewsletterBodyHtml,
  exportNewsletterFullHtml,
  type NewsletterVisualDocument,
} from '@/lib/marketing/newsletter-visual'
import { cn } from '@/lib/utils'
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Megaphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type ComposeContext = {
  loadedAt: string
  summary: Record<string, Record<string, unknown> | undefined>
  audiences: Array<{ id: string; name: string; member_count?: number }>
  recentCampaigns: Array<{ subject: string; status: string; open_rate?: number }>
}

type GenerateResult = {
  artifact: {
    name: string
    subject: string
    previewText: string
    social: { linkedin: string; x: string; slack: string }
  }
  visual: NewsletterVisualDocument
  bodyHtml: string
  audienceId: string | null
}

function formatNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value) || 0
  return new Intl.NumberFormat('en-US').format(n)
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <Icon className="size-3.5 text-[#7350FF]" />
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums text-white">{value}</div>
    </div>
  )
}

export function MarketingCampaignBuilder() {
  const [context, setContext] = useState<ComposeContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(true)
  const [brief, setBrief] = useState('')
  const [audienceId, setAudienceId] = useState('')
  const [visual, setVisual] = useState<NewsletterVisualDocument>(DEFAULT_NEWSLETTER_VISUAL)
  const [social, setSocial] = useState({ linkedin: '', x: '', slack: '' })
  const [campaignName, setCampaignName] = useState('')
  const [previewMode, setPreviewMode] = useState<'visual' | 'inbox'>('inbox')
  const [busy, setBusy] = useState<'generate' | 'stage' | 'refresh' | null>(null)
  const [message, setMessage] = useState('')
  const [staged, setStaged] = useState<{ editUrl?: string; approvalId?: string } | null>(null)

  async function loadContext() {
    setBusy((current) => current ?? 'refresh')
    try {
      const res = await fetch('/api/marketing/compose/context')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load context')
      setContext(data)
      setAudienceId((current) => current || data.audiences?.[0]?.id || '')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Context load failed')
    } finally {
      setLoadingContext(false)
      setBusy(null)
    }
  }

  useEffect(() => {
    void loadContext()
  }, [])

  const summary = context?.summary ?? {}
  const inboxPreviewHtml = useMemo(() => exportNewsletterFullHtml(visual), [visual])

  async function generate() {
    const sourceBrief = brief.trim()
    if (!sourceBrief) {
      setMessage('Add a campaign brief first.')
      return
    }

    setBusy('generate')
    setMessage('')
    setStaged(null)

    try {
      const res = await fetch('/api/marketing/compose/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: sourceBrief, audienceId: audienceId || null }),
      })
      const data = (await res.json()) as GenerateResult & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setVisual(data.visual)
      setCampaignName(data.artifact.name)
      setSocial(data.artifact.social)
      setMessage('Draft generated from live marketing context. Review, edit, then stage for approval.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(null)
    }
  }

  async function stageDraft() {
    setBusy('stage')
    setMessage('')

    try {
      const res = await fetch('/api/marketing/compose/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audienceId: audienceId || null,
          name: campaignName || visual.subject,
          subject: visual.subject,
          previewText: visual.previewText,
          bodyHtml: exportNewsletterBodyHtml(visual),
          visual,
          social,
          requestApproval: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Staging failed')

      setStaged({ editUrl: data.editUrl, approvalId: data.approvalId })
      setMessage('Newsletter + social drafts staged. Approval requested — send/publish blocked until approved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Staging failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[640px] flex-col gap-4">
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Send-safe" value={formatNumber(summary.contacts?.subscribed)} icon={Users} />
        <Stat label="Campaigns" value={formatNumber(summary.campaigns?.total)} icon={Mail} />
        <Stat label="Pending approval" value={formatNumber(summary.approvals?.pending)} icon={ShieldCheck} />
        <Stat label="HubSpot contacts" value={formatNumber(summary.contacts?.hubspot_imported)} icon={BadgeCheck} />
      </div>

      {message && (
        <div className="shrink-0 rounded-xl border border-[#7350FF]/25 bg-[#7350FF]/10 px-4 py-3 text-sm text-violet-100">{message}</div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Left — brief + context */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#11141d]/90">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Signal Compose</p>
                <h2 className="text-sm font-semibold text-white">Campaign brief</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadContext()}
                disabled={busy === 'refresh'}
                className="rounded-lg border border-white/10 p-2 text-zinc-400 transition-colors hover:text-white"
              >
                <RefreshCw className={cn('size-4', busy === 'refresh' && 'animate-spin')} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Audience</span>
              <select
                className="w-full rounded-xl border border-white/10 bg-[#141824] px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-[#7350FF]/70"
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                disabled={loadingContext}
              >
                {(context?.audiences || []).map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name} ({audience.member_count ?? 0})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">What should marketing ship?</span>
              <textarea
                className="min-h-[180px] w-full resize-y rounded-xl border border-white/10 bg-[#141824] px-3 py-3 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#7350FF]/70"
                placeholder="Example: May newsletter for partners — Hornets playoff run, new venue install at TD Garden, form spike from Contact 2026, CTA to book a media walkthrough."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </label>

            <div className="rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-relaxed text-zinc-500">
              <p className="font-semibold uppercase tracking-[0.12em] text-zinc-400">Context loaded</p>
              <ul className="mt-2 space-y-1">
                {(context?.recentCampaigns || []).slice(0, 3).map((campaign, index) => (
                  <li key={`${campaign.subject}-${index}`}>• {campaign.subject} ({campaign.status})</li>
                ))}
                {!context?.recentCampaigns?.length && <li>• HubSpot-imported audiences + templates</li>}
              </ul>
            </div>
          </div>

          <div className="border-t border-white/8 p-4">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy === 'generate' || !brief.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7350FF] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8465ff] disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate campaign
            </button>
          </div>
        </aside>

        {/* Center — newsletter preview / editor */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#11141d]/90">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Newsletter</p>
              <h2 className="text-sm font-semibold text-white">{visual.subject || 'Preview'}</h2>
            </div>
            <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setPreviewMode('inbox')}
                className={cn('rounded-md px-2.5 py-1 text-xs', previewMode === 'inbox' ? 'bg-white/10 text-white' : 'text-zinc-500')}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('visual')}
                className={cn('rounded-md px-2.5 py-1 text-xs', previewMode === 'visual' ? 'bg-white/10 text-white' : 'text-zinc-500')}
              >
                Edit blocks
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {previewMode === 'inbox' ? (
              <div className="h-full overflow-auto bg-[#0a0b10] p-4">
                <div className="mx-auto max-w-[640px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl">
                  <iframe title="Newsletter preview" srcDoc={inboxPreviewHtml} className="h-[min(720px,100%)] w-full border-0" />
                </div>
              </div>
            ) : (
              <div className="h-full overflow-auto p-3">
                <NewsletterVisualEditor
                  value={visual}
                  onChange={(doc) => {
                    setVisual(doc)
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right — social + stage */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#11141d]/90">
          <div className="border-b border-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Multi-channel</p>
            <h2 className="text-sm font-semibold text-white">Social variants</h2>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {(['linkedin', 'x', 'slack'] as const).map((platform) => (
              <label key={platform} className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <Megaphone className="size-3" />
                  {platform}
                </span>
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-xl border border-white/10 bg-[#141824] px-3 py-2.5 text-xs leading-relaxed text-zinc-100 outline-none focus:border-[#7350FF]/70"
                  value={social[platform]}
                  onChange={(e) => setSocial((prev) => ({ ...prev, [platform]: e.target.value }))}
                />
              </label>
            ))}

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-3.5" />
                Approval gate
              </div>
              <p className="mt-1.5 leading-relaxed text-amber-100/80">
                Staging creates a newsletter draft, social drafts, and a pending approval. Send and publish stay blocked until the configured approval group approves.
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/8 p-4">
            <button
              type="button"
              onClick={() => void stageDraft()}
              disabled={busy === 'stage'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2B66F6] disabled:opacity-50"
            >
              {busy === 'stage' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Stage + request approval
            </button>

            {staged?.editUrl && (
              <Link
                href={staged.editUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
              >
                <ExternalLink className="size-4" />
                Open visual editor
              </Link>
            )}

            {staged?.approvalId && (
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Approval queued
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
