'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { MarketingStudioShell } from '@/components/marketing/MarketingStudioShell'
import { NewsletterVisualEditor } from '@/components/marketing/newsletter-visual/NewsletterVisualEditor'
import {
  DEFAULT_NEWSLETTER_VISUAL,
  exportNewsletterBodyHtml,
  parseVisualDocument,
  type NewsletterVisualDocument,
} from '@/lib/marketing/newsletter-visual'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function NewsletterCampaignEditPage() {
  const params = useParams<{ id: string }>()
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
    <DashboardLayout fullBleed>
      <MarketingStudioShell
        title="Visual Newsletter Editor"
        subtitle={`${campaignName || 'Campaign'} · section blocks, ANC themes, and live inbox preview`}
        status={campaignStatus}
        message={message || undefined}
      >
        {loading ? (
          <div className="flex h-[calc(100vh-10rem)] items-center justify-center rounded-2xl border border-white/8 bg-[#11141d]/90 text-sm text-zinc-500">
            Loading visual composer…
          </div>
        ) : (
          <NewsletterVisualEditor value={doc} onChange={setDoc} onSave={save} saving={saving} saveLabel="Save" />
        )}
      </MarketingStudioShell>
    </DashboardLayout>
  )
}
