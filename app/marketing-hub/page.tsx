'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

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

const inputClass = 'w-full rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15'
const buttonClass = 'rounded bg-[#0A52EF] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'rounded border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50'

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

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warn' | 'good' }) {
  const colors = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-white text-zinc-900'
  return (
    <div className={`border p-4 ${colors}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</div>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const color = value === 'sent' || value === 'published'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : value === 'scheduled'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : value.includes('fail')
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-zinc-50 text-zinc-600 border-zinc-200'
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${color}`}>{value.replace(/_/g, ' ')}</span>
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
      const data = await fetchJson('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campaignForm, audienceId: campaignForm.audienceId || defaultAudienceId }),
      })
      setSelectedCampaignId(data.campaign.id)
      setMessage('Newsletter draft created.')
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
      <div className="space-y-5">
        <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E21B2D]">Media & Partnerships</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">Marketing Hub</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${tab === key ? 'border-[#0A52EF] bg-[#0A52EF] text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div className="border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">{message}</div>
        )}

        {loading ? (
          <div className="border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Loading Marketing Hub...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Send-Safe Contacts" value={summary?.contacts?.subscribed || 0} tone="good" />
                  <Stat label="Campaigns" value={summary?.campaigns?.total || 0} />
                  <Stat label="Suppressed" value={summary?.contacts?.suppressed || 0} tone="warn" />
                  <Stat label="Missing Channels" value={summary?.postiz?.missingChannels?.length || 0} tone="warn" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="HubSpot Imported" value={summary?.contacts?.hubspot_imported || 0} />
                  <Stat label="Non-Marketing" value={summary?.contacts?.non_marketing || 0} />
                  <Stat label="Review Candidates" value={summary?.contacts?.candidate || 0} />
                  <Stat label="Imported Emails" value={summary?.campaigns?.hubspot_imported_reference || 0} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Templates" value={summary?.templates?.total || 0} />
                  <Stat label="Pending Approval" value={summary?.approvals?.pending || 0} tone={summary?.approvals?.pending ? 'warn' : 'default'} />
                  <Stat label="Form Submissions" value={summary?.formSubmissions?.total || 0} />
                  <Stat label="CRM Notes" value={summary?.formSubmissions?.crm_notes || 0} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Sent Events" value={summary?.events?.sent_events || 0} />
                  <Stat label="Opens" value={summary?.events?.opens || 0} />
                  <Stat label="Clicks" value={summary?.events?.clicks || 0} />
                  <Stat label="Unsubscribes" value={summary?.events?.unsubscribes || 0} tone={summary?.events?.unsubscribes ? 'warn' : 'default'} />
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h2 className="text-sm font-semibold text-zinc-900">Recent Campaigns</h2>
                    </div>
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
                  <section className="border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h2 className="text-sm font-semibold text-zinc-900">Readiness</h2>
                    </div>
                    <div className="space-y-3 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3"><span>Email provider</span><StatusPill value="connected" /></div>
                      <div className="flex items-center justify-between gap-3"><span>Newsletter tracking</span><StatusPill value="connected" /></div>
                      <div className="flex items-center justify-between gap-3"><span>Forms routing</span><StatusPill value={`${summary?.formRoutes?.active || 0} active`} /></div>
                      <div className="flex items-center justify-between gap-3"><span>Postiz channels</span><span className="text-xs text-amber-700">Slack live; LinkedIn, X, Instagram pending</span></div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === 'audiences' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitContact} className="border border-zinc-200 bg-white p-4">
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
                <section className="border border-zinc-200 bg-white">
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
                <form onSubmit={submitCampaign} className="border border-zinc-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Newsletter Draft</h2>
                  <div className="mt-4 grid gap-3">
                    <input className={inputClass} value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
                    <select className={inputClass} value={campaignForm.templateId} onChange={(e) => {
                      const template = templates.find((item) => item.id === e.target.value)
                      if (template) applyNewsletterTemplate(template)
                      else setCampaignForm({ ...campaignForm, templateId: '' })
                    }}>
                      <option value="">No template</option>
                      {templates.filter((item) => item.template_type === 'newsletter').map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                    <input className={inputClass} value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} />
                    <input className={inputClass} value={campaignForm.previewText} onChange={(e) => setCampaignForm({ ...campaignForm, previewText: e.target.value })} />
                    <select className={inputClass} value={campaignForm.audienceId || defaultAudienceId} onChange={(e) => setCampaignForm({ ...campaignForm, audienceId: e.target.value })}>
                      {audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
                    </select>
                    <textarea className={`${inputClass} min-h-[180px] font-mono text-xs`} value={campaignForm.bodyHtml} onChange={(e) => setCampaignForm({ ...campaignForm, bodyHtml: e.target.value })} />
                    <button className={buttonClass} disabled={busy === 'campaign'}>Create Draft</button>
                  </div>
                </form>
                <section className="space-y-4">
                  <div className="border border-zinc-200 bg-white p-4">
                    <h2 className="text-sm font-semibold text-zinc-900">Send & Schedule</h2>
                    <div className="mt-4 grid gap-3">
                      <select className={inputClass} value={selectedCampaign?.id || ''} onChange={(e) => setSelectedCampaignId(e.target.value)}>
                        {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                      </select>
                      {selectedCampaign && (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => requestApproval('newsletter', selectedCampaign.id)}>Request Approval</button>
                          <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => decideApproval('newsletter', selectedCampaign.id, 'approve')}>Approve</button>
                          <button type="button" className={secondaryButton} disabled={busy === `approval-${selectedCampaign.id}`} onClick={() => decideApproval('newsletter', selectedCampaign.id, 'changes_requested')}>Changes</button>
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input className={inputClass} placeholder="Test email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                        <button type="button" className={secondaryButton} disabled={!selectedCampaign || busy === 'test'} onClick={sendTest}>Send Test</button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input className={inputClass} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                        <button type="button" className={buttonClass} disabled={!selectedCampaign || busy === 'schedule' || selectedCampaign.status !== 'approved'} onClick={scheduleCampaign}>Schedule</button>
                      </div>
                    </div>
                  </div>
                  <div className="border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h2 className="text-sm font-semibold text-zinc-900">Campaigns</h2>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {campaigns.map((campaign) => (
                        <button key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)} className="grid w-full gap-2 px-4 py-3 text-left text-sm hover:bg-zinc-50 md:grid-cols-[1fr_auto_auto] md:items-center">
                          <div>
                            <div className="font-medium text-zinc-900">{campaign.subject}</div>
                            <div className="text-xs text-zinc-500">{campaign.audience_name || 'No audience'} · {campaign.recipient_count || 0} recipients · {campaign.sent_count || 0} sent · {campaign.pending_count || 0} pending</div>
                          </div>
                          <StatusPill value={campaign.status} />
                          <div className="text-xs tabular-nums text-zinc-500">{campaign.open_rate ?? 0}% open · {campaign.click_rate ?? 0}% click · {campaign.unsubscribe_rate ?? 0}% unsub</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {tab === 'templates' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <form onSubmit={submitTemplate} className="border border-zinc-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Template Library</h2>
                  <div className="mt-4 grid gap-3">
                    <select className={inputClass} value={templateForm.templateType} onChange={(e) => setTemplateForm({ ...templateForm, templateType: e.target.value })}>
                      <option value="newsletter">Newsletter</option>
                      <option value="social">Social</option>
                    </select>
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
                    <button className={buttonClass} disabled={busy === 'template'}>Save Template</button>
                  </div>
                </form>
                <section className="border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Reusable Templates</h2>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {templates.map((template) => (
                      <div key={template.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-zinc-900">{template.name}</div>
                          <div className="text-xs text-zinc-500 capitalize">{template.template_type}{template.category ? ` · ${template.category}` : ''}{template.platform ? ` · ${template.platform}` : ''}</div>
                        </div>
                        <button type="button" className={secondaryButton} onClick={() => template.template_type === 'newsletter' ? applyNewsletterTemplate(template) : applySocialTemplate(template)}>Use</button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'approvals' && (
              <section className="border border-zinc-200 bg-white">
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
                <form onSubmit={submitRoute} className="border border-zinc-200 bg-white p-4">
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
                <section className="border border-zinc-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Active Routes</h2>
                    <button type="button" className={secondaryButton} disabled={busy === 'hubspot-submissions'} onClick={importHubSpotSubmissions}>Import HubSpot History</button>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {formRoutes.map((route) => (
                      <div key={route.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-zinc-900">{route.form_title}</div>
                          <div className="text-xs text-zinc-500">{route.inquiry_type || 'Any'} · {route.route_to_name} · {route.route_to_email}</div>
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
                          {submission.page_url && <div className="mt-1 truncate text-xs text-zinc-400">{submission.page_url}</div>}
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
                <form onSubmit={submitSocial} className="border border-zinc-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Social Draft</h2>
                  <div className="mt-4 grid gap-3">
                    <select className={inputClass} value={socialForm.templateId} onChange={(e) => {
                      const template = templates.find((item) => item.id === e.target.value)
                      if (template) applySocialTemplate(template)
                      else setSocialForm({ ...socialForm, templateId: '' })
                    }}>
                      <option value="">No template</option>
                      {templates.filter((item) => item.template_type === 'social').map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                    <select className={inputClass} value={socialForm.platform} onChange={(e) => setSocialForm({ ...socialForm, platform: e.target.value })}>
                      <option value="slack">Slack</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="x">X</option>
                      <option value="instagram">Instagram</option>
                    </select>
                    <input className={inputClass} placeholder="Channel/account" value={socialForm.channelName} onChange={(e) => setSocialForm({ ...socialForm, channelName: e.target.value })} />
                    <textarea className={`${inputClass} min-h-[140px]`} placeholder="Post copy" value={socialForm.content} onChange={(e) => setSocialForm({ ...socialForm, content: e.target.value })} />
                    <input className={inputClass} type="datetime-local" value={socialForm.scheduledAt} onChange={(e) => setSocialForm({ ...socialForm, scheduledAt: e.target.value })} />
                    <button className={buttonClass} disabled={busy === 'social'}>Save Draft</button>
                  </div>
                </form>
                <section className="border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">Social Queue</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Postiz is connected to Slack. LinkedIn, X, and Instagram need official ANC account connections before publishing.</div>
                    <div className="divide-y divide-zinc-100 border border-zinc-100">
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
