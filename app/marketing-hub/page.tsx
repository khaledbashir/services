'use client'

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DEFAULT_NEWSLETTER_VISUAL, exportNewsletterBodyHtml } from '@/lib/marketing/newsletter-visual'
import { BarChart3, CalendarClock, CheckCircle2, Clock3, FileText, LayoutTemplate, Mail, Megaphone, Palette, Send, Sparkles, Users } from 'lucide-react'
import Link from 'next/link'

type Audience = { id: string; name: string; description?: string; member_count?: number }
type Contact = { id: string; email: string; first_name?: string; last_name?: string; company_name?: string; subscription_status: string }
type Campaign = {
  id: string
  name: string
  subject: string
  preview_text?: string
  body_html: string
  audience_id?: string
  audience_name?: string
  status: string
  scheduled_at?: string
  recipient_count?: number
  pending_count?: number
  sent_count?: number
  failed_count?: number
  opened_count?: number
  clicked_count?: number
  unsubscribed_count?: number
  delivery_rate?: number
  open_rate?: number
  click_rate?: number
  unsubscribe_rate?: number
}
type FormRoute = { id: string; form_title: string; inquiry_type?: string; route_to_name: string; route_to_email: string; crm_target?: string; is_active: boolean }
type SocialPost = { id: string; platform: string; channel_name?: string; content: string; state: string; scheduled_at?: string }
type Template = {
  id: string
  template_type: 'newsletter' | 'social'
  name: string
  category?: string
  subject?: string
  preview_text?: string
  body_html?: string
  content?: string
  platform?: string
}
type ApprovalRequest = {
  id: string
  item_type: 'newsletter' | 'social'
  item_id: string
  status: string
  approver_group: string
  notes?: string
  requested_at: string
  decided_at?: string
}
type FormSubmission = {
  id: string
  form_title: string
  submitted_at?: string
  email?: string
  first_name?: string
  last_name?: string
  company_name?: string
  page_url?: string
  timeline_status: string
}

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15'
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-[#0A52EF] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50'
const panelClass = 'rounded-xl border border-zinc-200 bg-white shadow-sm'
const mutedPanelClass = 'rounded-xl border border-zinc-200 bg-zinc-50'

const defaultCampaignBodyHtml = `<h1 style="margin:0 0 10px;font-size:26px;line-height:1.18;color:#0f172a">Media & Partnerships Brief</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#334155">A focused update on the partner-facing moments, venue media opportunities, and audience signals moving through ANC Sports.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border-collapse:collapse">
  <tr>
    <td style="border-left:4px solid #e21b2d;background:#f8fafc;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b">Lead Story</div>
      <div style="font-size:18px;font-weight:700;line-height:1.3;color:#111827;margin-top:4px">The moment worth opening with</div>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#334155">Lead with the most useful partnership or venue story first. Keep it concrete, current, and tied to what the recipient should know next.</p>
    </td>
  </tr>
</table>
<h2 style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#111827">Partnership Signals</h2>
<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#334155">Use this section for sponsor-facing opportunities, league or venue momentum, campaign launches, or a quick note on where media demand is showing up.</p>
<h2 style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#111827">Venue Notes</h2>
<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#334155">Summarize the operational story behind the screen: new installs, upgraded inventory, live-event wins, or context that helps a partner understand ANC's reach.</p>
<h2 style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#111827">What To Watch</h2>
<p style="margin:0;font-size:14px;line-height:1.65;color:#334155">Close with the next action: a meeting, a partner follow-up, an upcoming event, or the one opportunity the audience should keep on their radar.</p>`

/* Primary KPI — the only stats that get card weight. Colour is reserved for
   numbers that need an operator to act; everything else stays neutral. */
function Stat({ label, value, tone = 'default', icon, hint }: { label: string; value: string | number; tone?: 'default' | 'warn' | 'good'; icon?: ReactNode; hint?: string }) {
  const numeric = typeof value === 'number' ? value : Number(value)
  const live = tone !== 'default' && Number.isFinite(numeric) && numeric > 0
  const valueTone = live && tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-zinc-600">{label}</div>
        {icon && <div className="text-zinc-400">{icon}</div>}
      </div>
      <div className={`mt-2 flex items-baseline gap-2 text-3xl font-semibold tabular-nums tracking-tight ${valueTone}`}>
        {value}
        {live && <span className={`size-1.5 rounded-full ${tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500'}`} />}
      </div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  )
}

/* Secondary metric — dense, no card chrome, deliberately quieter than a Stat. */
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-4 py-3">
      <div className="text-lg font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{label}</div>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const color = value === 'sent' || value === 'published'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : value === 'scheduled' || value === 'approved'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : value.includes('fail')
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-zinc-50 text-zinc-600 border-zinc-200'
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${color}`}>{value.replace(/_/g, ' ')}</span>
}

function SectionHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3">
      <div className="mt-0.5 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-zinc-700">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  )
}

function TemplateCard({ template, onUse }: { template: Template; onUse: () => void }) {
  const body = template.template_type === 'newsletter' ? template.preview_text || template.subject || 'Email layout template' : template.content || 'Social copy template'
  return (
    <button
      type="button"
      onClick={onUse}
      className="group rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-[#0A52EF]/40 hover:bg-zinc-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-900">{template.name}</div>
        <span className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-500 group-hover:text-zinc-700">
          {template.platform || template.template_type}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{body}</p>
    </button>
  )
}

function ChannelButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-[#0A52EF] bg-[#0A52EF] text-white' : 'border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50'}`}
    >
      {label}
    </button>
  )
}

export default function MarketingHubPage() {
  const [tab, setTab] = useState<'overview' | 'audiences' | 'campaigns' | 'templates' | 'approvals' | 'forms' | 'social'>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<any>(null)
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [formRoutes, setFormRoutes] = useState<FormRoute[]>([])
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [formSubmissions, setFormSubmissions] = useState<FormSubmission[]>([])

  const defaultAudienceId = audiences[0]?.id || ''
  const [contactForm, setContactForm] = useState({ name: '', email: '', companyName: '', audienceId: '' })
  const [campaignForm, setCampaignForm] = useState({
    name: 'Media & Partnerships Monthly Newsletter',
    subject: 'ANC Sports Media & Partnerships Update',
    previewText: 'Latest ANC media, venue, and partnership updates.',
    audienceId: '',
    templateId: '',
    bodyHtml: defaultCampaignBodyHtml,
  })
  const [testEmail, setTestEmail] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [routeForm, setRouteForm] = useState({ formId: '', formTitle: '', inquiryType: '', routeToName: '', routeToEmail: '', crmTarget: '' })
  const [templateForm, setTemplateForm] = useState({ templateType: 'newsletter', name: '', category: '', subject: '', previewText: '', bodyHtml: '', content: '', platform: 'linkedin' })
  const [socialForm, setSocialForm] = useState({ platform: 'slack', channelName: 'test', content: '', scheduledAt: '', templateId: '' })
  const [campaignCanvas, setCampaignCanvas] = useState<'preview' | 'html'>('preview')

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || campaigns[0],
    [campaigns, selectedCampaignId],
  )

  async function fetchJson(url: string, options?: RequestInit) {
    const res = await fetch(url, options)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [dashboard, audienceData, contactData, campaignData, routeData, socialData, templateData, approvalData, submissionData] = await Promise.all([
        fetchJson('/api/marketing/dashboard'),
        fetchJson('/api/marketing/audiences'),
        fetchJson('/api/marketing/contacts'),
        fetchJson('/api/marketing/campaigns'),
        fetchJson('/api/marketing/forms/routing'),
        fetchJson('/api/marketing/social'),
        fetchJson('/api/marketing/templates'),
        fetchJson('/api/marketing/approvals'),
        fetchJson('/api/marketing/forms/submissions'),
      ])
      setSummary(dashboard.summary)
      setAudiences(audienceData.audiences)
      setContacts(contactData.contacts)
      setCampaigns(campaignData.campaigns)
      setFormRoutes(routeData.routes)
      setSocialPosts(socialData.posts)
      setTemplates(templateData.templates)
      setApprovals(approvalData.approvals)
      setFormSubmissions(submissionData.submissions)
      const firstAudience = audienceData.audiences[0]?.id || ''
      setContactForm((prev) => ({ ...prev, audienceId: prev.audienceId || firstAudience }))
      setCampaignForm((prev) => ({ ...prev, audienceId: prev.audienceId || firstAudience }))
      setSelectedCampaignId((prev) => prev || campaignData.campaigns[0]?.id || '')
    } catch (err: any) {
      setMessage(err.message || 'Unable to load Marketing Hub')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function submitContact(e: FormEvent) {
    e.preventDefault()
    setBusy('contact')
    setMessage('')
    try {
      await fetchJson('/api/marketing/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contactForm, audienceId: contactForm.audienceId || defaultAudienceId }),
      })
      setContactForm({ name: '', email: '', companyName: '', audienceId: defaultAudienceId })
      setMessage('Contact added to audience.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function submitCampaign(e: FormEvent) {
    e.preventDefault()
    setBusy('campaign')
    setMessage('')
    try {
      const visualContent = {
        ...DEFAULT_NEWSLETTER_VISUAL,
        subject: campaignForm.subject,
        previewText: campaignForm.previewText,
      }
      const data = await fetchJson('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...campaignForm,
          audienceId: campaignForm.audienceId || defaultAudienceId,
          bodyHtml: campaignForm.bodyHtml || exportNewsletterBodyHtml(visualContent),
          visualContent,
        }),
      })
      setSelectedCampaignId(data.campaign.id)
      setMessage('Newsletter draft created. Open the visual editor to polish the layout.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function sendTest() {
    if (!selectedCampaign) return
    setBusy('test')
    setMessage('')
    try {
      await fetchJson(`/api/marketing/campaigns/${selectedCampaign.id}/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      })
      setMessage('Test newsletter sent with tracking enabled.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function scheduleCampaign() {
    if (!selectedCampaign) return
    setBusy('schedule')
    setMessage('')
    try {
      await fetchJson(`/api/marketing/campaigns/${selectedCampaign.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: scheduleAt }),
      })
      setMessage('Newsletter scheduled and recipients prepared.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function requestApproval(itemType: 'newsletter' | 'social', itemId: string) {
    setBusy(`approval-${itemId}`)
    setMessage('')
    try {
      await fetchJson('/api/marketing/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId, action: 'request' }),
      })
      setMessage('Approval requested.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function decideApproval(itemType: 'newsletter' | 'social', itemId: string, action: 'approve' | 'reject' | 'changes_requested') {
    setBusy(`approval-${itemId}`)
    setMessage('')
    try {
      await fetchJson('/api/marketing/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId, action }),
      })
      setMessage(action === 'approve' ? 'Approved.' : action === 'reject' ? 'Rejected.' : 'Changes requested.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function submitTemplate(e: FormEvent) {
    e.preventDefault()
    setBusy('template')
    setMessage('')
    try {
      await fetchJson('/api/marketing/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      })
      setTemplateForm({ templateType: 'newsletter', name: '', category: '', subject: '', previewText: '', bodyHtml: '', content: '', platform: 'linkedin' })
      setMessage('Template saved.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  function applyNewsletterTemplate(template: Template) {
    setCampaignForm((prev) => ({
      ...prev,
      templateId: template.id,
      name: template.name || prev.name,
      subject: template.subject || prev.subject,
      previewText: template.preview_text || prev.previewText,
      bodyHtml: template.body_html || prev.bodyHtml,
    }))
    setTab('campaigns')
    setMessage(`Loaded template: ${template.name}`)
  }

  function applySocialTemplate(template: Template) {
    setSocialForm((prev) => ({
      ...prev,
      templateId: template.id,
      platform: template.platform || prev.platform,
      content: template.content || prev.content,
    }))
    setTab('social')
    setMessage(`Loaded template: ${template.name}`)
  }

  async function importHubSpotSubmissions() {
    setBusy('hubspot-submissions')
    setMessage('')
    try {
      const data = await fetchJson('/api/marketing/forms/submissions/import-hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1000, attachNotes: true }),
      })
      setMessage(`Imported ${data.imported} HubSpot form submissions; CRM notes created: ${data.notesCreated}.`)
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function submitRoute(e: FormEvent) {
    e.preventDefault()
    setBusy('route')
    setMessage('')
    try {
      await fetchJson('/api/marketing/forms/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeForm),
      })
      setRouteForm({ formId: '', formTitle: '', inquiryType: '', routeToName: '', routeToEmail: '', crmTarget: '' })
      setMessage('Form routing rule saved.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function submitSocial(e: FormEvent) {
    e.preventDefault()
    setBusy('social')
    setMessage('')
    try {
      await fetchJson('/api/marketing/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(socialForm),
      })
      setSocialForm({ platform: 'slack', channelName: 'test', content: '', scheduledAt: '', templateId: '' })
      setMessage('Social draft saved.')
      await loadAll()
    } catch (err: any) {
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  const tabs = [
    ['overview', 'Overview'],
    ['audiences', 'Audiences'],
    ['campaigns', 'Newsletters'],
    ['templates', 'Templates'],
    ['approvals', 'Approvals'],
    ['forms', 'Forms'],
    ['social', 'Social'],
  ] as const

  return (
    <DashboardLayout>
      <div className="space-y-5 text-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Media &amp; Partnerships</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-900">Marketing Command Center</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600">Audiences, newsletters, forms, approvals, and social planning in one operator surface.</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href="/marketing-hub/release"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <FileText className="size-4 text-zinc-400" />
              Release Kit
            </Link>
            <Link
              href="/marketing-hub/studio"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <Sparkles className="size-4 text-zinc-400" />
              Marketing Agent
            </Link>
            <Link
              href="/marketing-hub/creative"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0840C0]"
            >
              <Palette className="size-4" />
              Ad Creative Studio
            </Link>
          </div>
        </div>

        <div className="-mb-px flex flex-wrap items-center gap-1 border-b border-zinc-200">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-[#0A52EF] text-zinc-900' : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <div className="rounded-md border border-[#0A52EF]/20 bg-[#0A52EF]/[0.06] px-4 py-3 text-sm text-[#0840C0]">{message}</div>
        )}

        {loading ? (
          <div className={panelClass + ' p-8 text-sm text-zinc-500'}>Loading Marketing Hub...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Tier 1 — the four numbers an operator acts on. Only these get card weight. */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Send-Safe Contacts" value={summary?.contacts?.subscribed || 0} tone="good" hint="Cleared to receive" icon={<Users className="size-4" />} />
                  <Stat label="Campaigns" value={summary?.campaigns?.total || 0} hint="Drafts, imports, and sends" icon={<Mail className="size-4" />} />
                  <Stat label="Pending Approval" value={summary?.approvals?.pending || 0} tone="warn" hint="Waiting on a decision" icon={<CheckCircle2 className="size-4" />} />
                  <Stat label="Pending Channels" value={summary?.socialChannels?.pendingChannels?.length ?? summary?.postiz?.missingChannels?.length ?? 0} tone="warn" hint="Need account connection" icon={<Megaphone className="size-4" />} />
                </div>

                {/* Tier 2 — reference counts, grouped and deliberately quieter. */}
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {[
                    {
                      group: 'Audience',
                      items: [
                        { label: 'Suppressed', value: summary?.contacts?.suppressed || 0 },
                        { label: 'HubSpot imported', value: summary?.contacts?.hubspot_imported || 0 },
                        { label: 'Non-marketing', value: summary?.contacts?.non_marketing || 0 },
                        { label: 'Review candidates', value: summary?.contacts?.candidate || 0 },
                      ],
                    },
                    {
                      group: 'Content',
                      items: [
                        { label: 'Templates', value: summary?.templates?.total || 0 },
                        { label: 'Imported emails', value: summary?.campaigns?.hubspot_imported_reference || 0 },
                        { label: 'Form submissions', value: summary?.formSubmissions?.total || 0 },
                        { label: 'CRM notes', value: summary?.formSubmissions?.crm_notes || 0 },
                      ],
                    },
                    {
                      group: 'Delivery',
                      items: [
                        { label: 'Sent events', value: summary?.events?.sent_events || 0 },
                        { label: 'Opens', value: summary?.events?.opens || 0 },
                        { label: 'Clicks', value: summary?.events?.clicks || 0 },
                        { label: 'Unsubscribes', value: summary?.events?.unsubscribes || 0 },
                      ],
                    },
                  ].map((row) => (
                    <div key={row.group} className="grid border-b border-zinc-100 last:border-b-0 lg:grid-cols-[140px_1fr]">
                      <div className="flex items-center border-b border-zinc-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 lg:border-b-0 lg:border-r lg:py-0">
                        {row.group}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-zinc-100 sm:grid-cols-4">
                        {row.items.map((item) => (
                          <MiniStat key={item.label} label={item.label} value={item.value} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className={panelClass}>
                    <SectionHeader icon={<Mail className="size-4" />} title="Recent Campaigns" subtitle="Newsletter drafts, imports, tests, and sent performance." />
                    <div className="divide-y divide-zinc-100">
                      {campaigns.slice(0, 6).map((campaign) => (
                        <div key={campaign.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto] md:items-center">
                          <div>
                            <div className="font-medium text-zinc-900">{campaign.name}</div>
                            <div className="text-xs text-zinc-500">{campaign.audience_name || 'No audience'} · {campaign.recipient_count || 0} recipients</div>
                          </div>
                          <StatusPill value={campaign.status} />
                          <div className="text-xs tabular-nums text-zinc-500">{campaign.open_rate ?? 0}% open · {campaign.click_rate ?? 0}% click</div>
                        </div>
                      ))}
                      {campaigns.length === 0 && <div className="px-4 py-8 text-sm text-zinc-500">No campaigns yet.</div>}
                    </div>
                  </section>
                  <section className={panelClass}>
                    <SectionHeader icon={<CheckCircle2 className="size-4" />} title="Readiness" subtitle="What is ready to use and what needs account connection." />
                    <div className="space-y-3 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3"><span className="text-zinc-700">Email provider</span><StatusPill value="connected" /></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-zinc-700">Newsletter tracking</span><StatusPill value="connected" /></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-zinc-700">Forms routing</span><StatusPill value={`${summary?.formRoutes?.active || 0} active`} /></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-zinc-700">Social channels</span><span className="text-xs text-amber-700">Planning ready; accounts pending</span></div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === 'audiences' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitContact} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-zinc-900">Add Contact</h2>
                  <div className="mt-4 grid gap-3">
                    <input className={inputClass} placeholder="Name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
                    <input className={inputClass} placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                    <input className={inputClass} placeholder="Company" value={contactForm.companyName} onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })} />
                    <select className={inputClass} value={contactForm.audienceId || defaultAudienceId} onChange={(e) => setContactForm({ ...contactForm, audienceId: e.target.value })}>
                      {audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
                    </select>
                    <button className={buttonClass} disabled={busy === 'contact'}>Add to Audience</button>
                  </div>
                </form>
                <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Contacts</h2>
                  </div>
                  <div className="max-h-[520px] divide-y divide-zinc-100 overflow-auto">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-zinc-900">{[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email}</div>
                          <div className="text-xs text-zinc-500">{contact.email}{contact.company_name ? ` · ${contact.company_name}` : ''}</div>
                        </div>
                        <StatusPill value={contact.subscription_status} />
                      </div>
                    ))}
                    {contacts.length === 0 && <div className="px-4 py-8 text-sm text-zinc-500">No contacts yet.</div>}
                  </div>
                </section>
              </div>
            )}

            {tab === 'campaigns' && (
              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <form onSubmit={submitCampaign} className={panelClass + ' overflow-hidden'}>
                  <SectionHeader icon={<Mail className="size-4" />} title="Newsletter Builder" subtitle="Start from a template, edit the brief, then preview before approval." />
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2 px-4 sm:grid-cols-2">
                      {templates.filter((item) => item.template_type === 'newsletter').slice(0, 4).map((template) => (
                        <TemplateCard key={template.id} template={template} onUse={() => applyNewsletterTemplate(template)} />
                      ))}
                    </div>
                    <div className="grid gap-3 px-4">
                      <input className={inputClass} value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
                      <input className={inputClass} value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} />
                      <input className={inputClass} value={campaignForm.previewText} onChange={(e) => setCampaignForm({ ...campaignForm, previewText: e.target.value })} />
                      <select className={inputClass} value={campaignForm.audienceId || defaultAudienceId} onChange={(e) => setCampaignForm({ ...campaignForm, audienceId: e.target.value })}>
                        {audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
                      </select>
                    </div>
                    <div className="px-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Canvas</span>
                        <div className="flex rounded-md border border-zinc-200 bg-white p-1">
                          <button type="button" onClick={() => setCampaignCanvas('preview')} className={`rounded px-2.5 py-1 text-xs ${campaignCanvas === 'preview' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'}`}>Preview</button>
                          <button type="button" onClick={() => setCampaignCanvas('html')} className={`rounded px-2.5 py-1 text-xs ${campaignCanvas === 'html' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'}`}>HTML</button>
                        </div>
                      </div>
                      {campaignCanvas === 'preview' ? (
                        <div className="max-h-[340px] overflow-auto rounded-md border border-zinc-200 bg-white p-5 text-zinc-900">
                          <div className="mb-4 border-b border-zinc-200 pb-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Subject</div>
                            <div className="mt-1 text-lg font-semibold">{campaignForm.subject}</div>
                            <div className="mt-1 text-sm text-zinc-500">{campaignForm.previewText}</div>
                          </div>
                          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: campaignForm.bodyHtml }} />
                        </div>
                      ) : (
                        <textarea className={`${inputClass} min-h-[340px] font-mono text-xs`} value={campaignForm.bodyHtml} onChange={(e) => setCampaignForm({ ...campaignForm, bodyHtml: e.target.value })} />
                      )}
                    </div>
                    <div className="border-t border-zinc-200 p-4">
                      <button className={buttonClass + ' w-full'} disabled={busy === 'campaign'}><Sparkles className="size-4" /> Create Draft</button>
                    </div>
                  </div>
                </form>
                <section className="space-y-4">
                  <div className={panelClass + ' p-4'}>
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><CalendarClock className="size-4 text-zinc-500" /> Send & Schedule</div>
                    <div className="mt-4 grid gap-3">
                      <select className={inputClass} value={selectedCampaign?.id || ''} onChange={(e) => setSelectedCampaignId(e.target.value)}>
                        {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                      </select>
                      {selectedCampaign && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Link
                            href={`/marketing-hub/campaigns/${selectedCampaign.id}/edit`}
                            className={buttonClass + ' w-full text-center no-underline'}
                          >
                            <Palette className="size-4" />
                            Visual Editor
                          </Link>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => requestApproval('newsletter', selectedCampaign.id)}><CheckCircle2 className="size-4" /> Approval</button>
                            <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => decideApproval('newsletter', selectedCampaign.id, 'approve')}>Approve</button>
                            <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => decideApproval('newsletter', selectedCampaign.id, 'changes_requested')}>Changes</button>
                          </div>
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input className={inputClass} placeholder="Test email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                        <button type="button" className={secondaryButton} disabled={!selectedCampaign || busy === 'test'} onClick={sendTest}>Send Test</button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input className={inputClass} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                        <button type="button" className={buttonClass} disabled={!selectedCampaign || busy === 'schedule' || selectedCampaign.status !== 'approved'} onClick={scheduleCampaign}><Send className="size-4" /> Schedule</button>
                      </div>
                    </div>
                  </div>
                  <div className={panelClass}>
                    <SectionHeader icon={<BarChart3 className="size-4" />} title="Campaigns" subtitle="Select one to test, approve, or schedule." />
                    <div className="divide-y divide-zinc-800">
                      {campaigns.map((campaign) => (
                        <div key={campaign.id} className="grid w-full gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-zinc-50 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                          <button type="button" onClick={() => setSelectedCampaignId(campaign.id)} className="text-left">
                            <div className="font-medium text-zinc-900">{campaign.subject}</div>
                            <div className="text-xs text-zinc-500">{campaign.audience_name || 'No audience'} · {campaign.recipient_count || 0} recipients · {campaign.sent_count || 0} sent · {campaign.pending_count || 0} pending</div>
                          </button>
                          <StatusPill value={campaign.status} />
                          <div className="text-xs tabular-nums text-zinc-500">{campaign.open_rate ?? 0}% open · {campaign.click_rate ?? 0}% click · {campaign.unsubscribe_rate ?? 0}% unsub</div>
                          <Link
                            href={`/marketing-hub/campaigns/${campaign.id}/edit`}
                            className={secondaryButton + ' whitespace-nowrap no-underline'}
                          >
                            <Palette className="size-4" />
                            Visual
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {tab === 'templates' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitTemplate} className={panelClass + ' overflow-hidden'}>
                  <SectionHeader icon={<LayoutTemplate className="size-4" />} title="Template Studio" subtitle="Save reusable newsletter layouts or social copy patterns." />
                  <div className="grid gap-3 p-4">
                    <div className="grid grid-cols-2 gap-2">
                      <ChannelButton active={templateForm.templateType === 'newsletter'} label="Newsletter" onClick={() => setTemplateForm({ ...templateForm, templateType: 'newsletter' })} />
                      <ChannelButton active={templateForm.templateType === 'social'} label="Social" onClick={() => setTemplateForm({ ...templateForm, templateType: 'social' })} />
                    </div>
                    <input className={inputClass} placeholder="Template name" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                    <input className={inputClass} placeholder="Category" value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} />
                    {templateForm.templateType === 'newsletter' ? (
                      <>
                        <input className={inputClass} placeholder="Subject" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
                        <input className={inputClass} placeholder="Preview text" value={templateForm.previewText} onChange={(e) => setTemplateForm({ ...templateForm, previewText: e.target.value })} />
                        <textarea className={`${inputClass} min-h-[180px] font-mono text-xs`} placeholder="Email HTML" value={templateForm.bodyHtml} onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <select className={inputClass} value={templateForm.platform} onChange={(e) => setTemplateForm({ ...templateForm, platform: e.target.value })}>
                          <option value="linkedin">LinkedIn</option>
                          <option value="x">X</option>
                          <option value="instagram">Instagram</option>
                          <option value="slack">Slack</option>
                        </select>
                        <textarea className={`${inputClass} min-h-[160px]`} placeholder="Post copy" value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} />
                      </>
                    )}
                    <button className={buttonClass} disabled={busy === 'template'}><LayoutTemplate className="size-4" /> Save Template</button>
                  </div>
                </form>
                <section className={panelClass + ' overflow-hidden'}>
                  <SectionHeader icon={<Sparkles className="size-4" />} title="Reusable Templates" subtitle="Click a card to load it into the right workflow." />
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    {templates.map((template) => (
                      <TemplateCard key={template.id} template={template} onUse={() => template.template_type === 'newsletter' ? applyNewsletterTemplate(template) : applySocialTemplate(template)} />
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'approvals' && (
              <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">Approval Queue</h2>
                </div>
                <div className="divide-y divide-zinc-100">
                  {approvals.map((approval) => (
                    <div key={approval.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
                      <div>
                        <div className="font-medium capitalize text-zinc-900">{approval.item_type} approval</div>
                        <div className="text-xs text-zinc-500">Approvers: {approval.approver_group} · {new Date(approval.requested_at).toLocaleString()}</div>
                        {approval.notes && <div className="mt-1 text-xs text-zinc-500">{approval.notes}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={approval.status} />
                        <button type="button" className={secondaryButton} disabled={busy === `approval-${approval.item_id}`} onClick={() => decideApproval(approval.item_type, approval.item_id, 'approve')}>Approve</button>
                        <button type="button" className={secondaryButton} disabled={busy === `approval-${approval.item_id}`} onClick={() => decideApproval(approval.item_type, approval.item_id, 'changes_requested')}>Changes</button>
                        <button type="button" className={secondaryButton} disabled={busy === `approval-${approval.item_id}`} onClick={() => decideApproval(approval.item_type, approval.item_id, 'reject')}>Reject</button>
                      </div>
                    </div>
                  ))}
                  {approvals.length === 0 && <div className="px-4 py-8 text-sm text-zinc-500">No approval requests yet.</div>}
                </div>
              </section>
            )}

            {tab === 'forms' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitRoute} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-zinc-900">Routing Rule</h2>
                  <div className="mt-4 grid gap-3">
                    <input className={inputClass} placeholder="Form ID" value={routeForm.formId} onChange={(e) => setRouteForm({ ...routeForm, formId: e.target.value })} />
                    <input className={inputClass} placeholder="Form title" value={routeForm.formTitle} onChange={(e) => setRouteForm({ ...routeForm, formTitle: e.target.value })} />
                    <input className={inputClass} placeholder="Inquiry type" value={routeForm.inquiryType} onChange={(e) => setRouteForm({ ...routeForm, inquiryType: e.target.value })} />
                    <input className={inputClass} placeholder="Route to name" value={routeForm.routeToName} onChange={(e) => setRouteForm({ ...routeForm, routeToName: e.target.value })} />
                    <input className={inputClass} placeholder="Route to email" value={routeForm.routeToEmail} onChange={(e) => setRouteForm({ ...routeForm, routeToEmail: e.target.value })} />
                    <input className={inputClass} placeholder="CRM target" value={routeForm.crmTarget} onChange={(e) => setRouteForm({ ...routeForm, crmTarget: e.target.value })} />
                    <button className={buttonClass} disabled={busy === 'route'}>Save Rule</button>
                  </div>
                </form>
                <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Active Routes</h2>
                    <button type="button" className={secondaryButton} disabled={busy === 'hubspot-submissions'} onClick={importHubSpotSubmissions}>Import HubSpot History</button>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {formRoutes.map((route) => (
                      <div key={route.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-zinc-900">{route.form_title}</div>
                          <div className="text-xs text-zinc-500">{route.inquiry_type || 'Any'} · {route.route_to_name} · configured inbox</div>
                        </div>
                        <StatusPill value={route.is_active ? 'active' : 'paused'} />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Submission History</h2>
                  </div>
                  <div className="max-h-[360px] divide-y divide-zinc-100 overflow-auto">
                    {formSubmissions.map((submission) => (
                      <div key={submission.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-zinc-900">{submission.form_title}</div>
                          <div className="text-xs text-zinc-500">
                            {[submission.first_name, submission.last_name].filter(Boolean).join(' ') || submission.email || 'Unknown'}
                            {submission.company_name ? ` · ${submission.company_name}` : ''}
                            {submission.submitted_at ? ` · ${new Date(submission.submitted_at).toLocaleDateString()}` : ''}
                          </div>
                          {submission.page_url && <div className="mt-1 truncate text-xs text-zinc-600">{submission.page_url}</div>}
                        </div>
                        <StatusPill value={submission.timeline_status} />
                      </div>
                    ))}
                    {formSubmissions.length === 0 && <div className="px-4 py-8 text-sm text-zinc-500">No imported submissions yet.</div>}
                  </div>
                </section>
              </div>
            )}

            {tab === 'social' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitSocial} className={panelClass + ' overflow-hidden'}>
                  <SectionHeader icon={<Megaphone className="size-4" />} title="Social Draft Studio" subtitle="Pick a template, choose channel, preview the post, then send it for approval." />
                  <div className="grid gap-3 p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {templates.filter((item) => item.template_type === 'social').map((template) => (
                        <TemplateCard key={template.id} template={template} onUse={() => applySocialTemplate(template)} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {['linkedin', 'x', 'instagram', 'slack'].map((channel) => (
                        <ChannelButton key={channel} active={socialForm.platform === channel} label={channel === 'x' ? 'X' : channel[0].toUpperCase() + channel.slice(1)} onClick={() => setSocialForm({ ...socialForm, platform: channel })} />
                      ))}
                    </div>
                    <input className={inputClass} placeholder="Channel/account" value={socialForm.channelName} onChange={(e) => setSocialForm({ ...socialForm, channelName: e.target.value })} />
                    <textarea className={`${inputClass} min-h-[140px]`} placeholder="Post copy" value={socialForm.content} onChange={(e) => setSocialForm({ ...socialForm, content: e.target.value })} />
                    <input className={inputClass} type="datetime-local" value={socialForm.scheduledAt} onChange={(e) => setSocialForm({ ...socialForm, scheduledAt: e.target.value })} />
                    <div className={mutedPanelClass + ' p-4'}>
                      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                        <span className="font-medium uppercase tracking-[0.12em]">Live Preview</span>
                        <span>{socialForm.content.length} chars</span>
                      </div>
                      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium capitalize text-zinc-900">{socialForm.platform || 'Channel'}</div>
                          <StatusPill value={socialForm.scheduledAt ? 'scheduled' : 'draft'} />
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{socialForm.content || 'Choose a template or write the post copy here.'}</p>
                      </div>
                    </div>
                    <button className={buttonClass} disabled={busy === 'social'}><Megaphone className="size-4" /> Save Draft</button>
                  </div>
                </form>
                <section className={panelClass + ' overflow-hidden'}>
                  <SectionHeader icon={<Clock3 className="size-4" />} title="Social Queue" subtitle="Drafts, scheduled posts, and approval actions." />
                  <div className="space-y-3 p-4">
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">Signal is ready for planning and approvals. Connect official LinkedIn, X, Instagram, and Slack publishing before live posting.</div>
                    <div className="divide-y divide-zinc-800 rounded-md border border-zinc-200">
                      {socialPosts.map((post) => (
                        <div key={post.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                          <div>
                            <div className="font-medium capitalize text-zinc-900">{post.platform}{post.channel_name ? ` · ${post.channel_name}` : ''}</div>
                            <div className="text-xs text-zinc-500 line-clamp-2">{post.content}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill value={post.state} />
                            <button type="button" className={secondaryButton} disabled={busy === `approval-${post.id}`} onClick={() => requestApproval('social', post.id)}>Approval</button>
                            <button type="button" className={secondaryButton} disabled={busy === `approval-${post.id}`} onClick={() => decideApproval('social', post.id, 'approve')}>Approve</button>
                          </div>
                        </div>
                      ))}
                      {socialPosts.length === 0 && <div className="px-3 py-8 text-sm text-zinc-500">No social drafts yet.</div>}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
