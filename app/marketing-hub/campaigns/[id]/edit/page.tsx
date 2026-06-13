'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { NewsletterVisualEditor } from '@/components/marketing/newsletter-visual/NewsletterVisualEditor'
import {
  DEFAULT_NEWSLETTER_VISUAL,
  exportNewsletterBodyHtml,
  parseVisualDocument,
  type NewsletterVisualDocument,
} from '@/lib/marketing/newsletter-visual'
import { ArrowLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function NewsletterCampaignEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [campaignStatus, setCampaignStatus] = useState('draft')
  const [doc, setDoc] = useState<NewsletterVisualDocument>(DEFAULT_NEWSLETTER_VISUAL)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/marketing/campaigns/${campaignId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load campaign')
        if (cancelled) return

        const campaign = data.campaign
        setCampaignName(campaign.name)
        setCampaignStatus(campaign.status)

        const parsed = parseVisualDocument(campaign.visual_content)
        if (parsed) {
          setDoc({
            ...parsed,
            subject: parsed.subject || campaign.subject,
            previewText: parsed.previewText || campaign.preview_text || '',
          })
        } else {
          setDoc({
            ...DEFAULT_NEWSLETTER_VISUAL,
            subject: campaign.subject,
            previewText: campaign.preview_text || DEFAULT_NEWSLETTER_VISUAL.previewText,
          })
        }
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : 'Failed to load campaign')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const bodyHtml = exportNewsletterBodyHtml(doc)
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          subject: doc.subject,
          previewText: doc.previewText,
          bodyHtml,
          visualContent: doc,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMessage('Newsletter saved. HTML export is synced to the send pipeline.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/marketing-hub"
              className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="size-3.5" />
              Marketing Hub
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-100">Visual Newsletter Editor</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {campaignName || 'Campaign'} · DealDeck-style blocks · live inbox preview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-zinc-700 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{campaignStatus}</span>
            <button
              type="button"
              onClick={() => router.push('/marketing-hub')}
              className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Back to hub
            </button>
          </div>
        </div>

        {message && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200">{message}</div>
        )}

        {loading ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/70 px-6 py-16 text-center text-sm text-zinc-500">
            Loading visual composer…
          </div>
        ) : (
          <>
            <div className="rounded-md border border-[#7350FF]/20 bg-[#7350FF]/5 px-4 py-3 text-sm text-zinc-200">
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="size-4 text-[#7350FF]" />
                Same visual stack as presentation.basheer.app — section blocks, ANC themes, live preview.
              </div>
              <p className="mt-1 text-xs text-zinc-400">Saving updates both the visual document and the email HTML used by test send and schedule.</p>
            </div>
            <NewsletterVisualEditor value={doc} onChange={setDoc} onSave={save} saving={saving} />
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
