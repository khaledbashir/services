import { loadProviders, type ProviderConfig } from '@/lib/ai/agent'
import { ANC_BRAND_VOICE } from '@/lib/signal/voice'
import {
  createSection,
  exportNewsletterBodyHtml,
  type NewsletterSectionType,
  type NewsletterVisualDocument,
} from '@/lib/marketing/newsletter-visual'
import type { MarketingComposeContext } from '@/lib/marketing/compose-context'

export type GeneratedSection = {
  type: NewsletterSectionType
  eyebrow?: string
  headline?: string
  body?: string
  venue?: string
  eventDate?: string
  ctaLabel?: string
  ctaUrl?: string
}

export type GeneratedCampaignArtifact = {
  name: string
  subject: string
  previewText: string
  sections: GeneratedSection[]
  social: {
    linkedin: string
    x: string
    slack: string
  }
}

const SECTION_TYPES: NewsletterSectionType[] = ['hero', 'spotlight', 'story', 'event', 'cta']

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function extractJson(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1]?.trim() || trimmed
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON')
  return JSON.parse(source.slice(start, end + 1)) as GeneratedCampaignArtifact
}

function normalizeSection(raw: GeneratedSection, index: number): GeneratedSection {
  const type = SECTION_TYPES.includes(raw.type) ? raw.type : (['hero', 'spotlight', 'story', 'event', 'cta'][index] as NewsletterSectionType)
  return {
    type,
    eyebrow: raw.eyebrow?.trim() || undefined,
    headline: raw.headline?.trim() || 'ANC Sports Update',
    body: raw.body?.trim() || '',
    venue: raw.venue?.trim() || undefined,
    eventDate: raw.eventDate?.trim() || undefined,
    ctaLabel: raw.ctaLabel?.trim() || undefined,
    ctaUrl: raw.ctaUrl?.trim() || undefined,
  }
}

function providerRequestBody(provider: ProviderConfig, messages: ChatMessage[]) {
  const isMercury = provider.name === 'inception-mercury' || provider.model.toLowerCase().includes('mercury')
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: isMercury ? 0.6 : 0.65,
    max_tokens: 2800,
  }
  if (isMercury) {
    body.reasoning_effort = process.env.MERCURY_REASONING_EFFORT || 'medium'
    body.realtime = true
  }
  return body
}

async function callMarketingModel(userPrompt: string) {
  const providers = loadProviders()
  const messages: ChatMessage[] = [
    { role: 'system', content: ANC_BRAND_VOICE },
    { role: 'user', content: userPrompt },
  ]
  let lastError = ''

  for (const provider of providers) {
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify(providerRequestBody(provider, messages)),
        signal: AbortSignal.timeout(90000),
      })
      const body = await res.text()
      if (!res.ok) {
        lastError = `${provider.name} ${res.status}: ${body.slice(0, 160)}`
        continue
      }
      const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }
      const text = data.choices?.[0]?.message?.content?.trim()
      if (!text) {
        lastError = `${provider.name}: empty response`
        continue
      }
      return text
    } catch (err) {
      lastError = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  throw new Error(lastError || 'No marketing AI providers responded')
}

function sentenceCase(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function fallbackArtifact(input: {
  brief: string
  audienceName?: string
  context: MarketingComposeContext
}): GeneratedCampaignArtifact {
  const brief = sentenceCase(input.brief).slice(0, 180)
  const audience = input.audienceName || 'ANC media and partnerships audience'
  const venueHint =
    input.context.recentCampaigns?.[0]?.name ||
    input.context.newsletterTemplates?.[0]?.name ||
    'ANC venue network'
  const subjectBase = brief.length > 72 ? `${brief.slice(0, 69).trim()}...` : brief
  const subject = subjectBase || 'ANC Sports Media & Partnerships Update'

  return {
    name: `${audience} - AI Assisted Draft`,
    subject,
    previewText: 'A focused ANC update with partner-facing moments, venue context, and a clear next step.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Media & Partnerships',
        headline: subject,
        body: `Here is a focused starting point for ${audience}. ${brief || 'Use this draft to frame the latest ANC venue, partner, and media moments.'}`,
        ctaLabel: 'Review the update',
      },
      {
        type: 'spotlight',
        eyebrow: 'Venue Signal',
        headline: 'A useful moment to lead with',
        body: `Anchor the newsletter around the strongest venue or partner proof available right now. ${venueHint} can be used as the first visual/context cue, then tightened before approval.`,
      },
      {
        type: 'story',
        eyebrow: 'Partner Context',
        headline: 'Why it matters',
        body: 'Connect the operational story behind the screen to the audience: reach, fan engagement, sponsor value, event timing, or a practical reason to follow up.',
      },
      {
        type: 'cta',
        eyebrow: 'Next Step',
        headline: 'Move it into review',
        body: 'Review the copy, adjust any venue-specific details, then stage it for the normal approval path before sending.',
        ctaLabel: 'Send for approval',
      },
    ],
    social: {
      linkedin: `${subject}\n\nANC Sports continues turning venue moments into partner-ready media opportunities. This draft is ready for review and approval before publishing.`,
      x: `${subject} — ANC venue and partner update ready for review.`,
      slack: `Draft ready for review: ${subject}`,
    },
  }
}

export function artifactToVisualDocument(artifact: GeneratedCampaignArtifact): NewsletterVisualDocument {
  const sections = (artifact.sections.length ? artifact.sections : [{ type: 'hero' as const, headline: artifact.subject, body: artifact.previewText }])
    .slice(0, 7)
    .map((section, index) => {
      const normalized = normalizeSection(section, index)
      const base = createSection(normalized.type)
      return {
        ...base,
        eyebrow: normalized.eyebrow ?? base.eyebrow,
        headline: normalized.headline ?? base.headline,
        body: normalized.body ?? base.body,
        venue: normalized.venue ?? base.venue,
        eventDate: normalized.eventDate ?? base.eventDate,
        ctaLabel: normalized.ctaLabel ?? base.ctaLabel,
        ctaUrl: normalized.ctaUrl ?? base.ctaUrl,
      }
    })

  return {
    version: 1,
    theme: 'ancNewsletter',
    subject: artifact.subject,
    previewText: artifact.previewText,
    sections,
  }
}

export async function generateCampaignArtifact(input: {
  brief: string
  audienceName?: string
  context: MarketingComposeContext
}): Promise<{ artifact: GeneratedCampaignArtifact; visual: NewsletterVisualDocument; bodyHtml: string }> {
  const audienceLine = input.audienceName ? `Target audience: ${input.audienceName}` : 'Target audience: general marketing list'
  const userPrompt = `${input.context.promptBlock}

Operator brief:
${input.brief}

${audienceLine}

Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "name": "internal campaign name",
  "subject": "email subject line",
  "previewText": "inbox preview text",
  "sections": [
    { "type": "hero|spotlight|story|event|cta", "eyebrow": "...", "headline": "...", "body": "...", "venue": "optional", "eventDate": "optional", "ctaLabel": "optional", "ctaUrl": "optional" }
  ],
  "social": { "linkedin": "...", "x": "max 240 chars", "slack": "..." }
}

Rules:
- Use 4-6 newsletter sections in ANC voice.
- Name real venues, partners, or leagues when the brief implies them; do not invent fake clients.
- LinkedIn 60-180 words; X under 240 characters; Slack internal/casual.
- Colors/branding reference: navy #212240, accent purple #7350FF, ANC blue #0A52EF.`

  let parsed: GeneratedCampaignArtifact
  try {
    parsed = extractJson(await callMarketingModel(userPrompt))
  } catch (err) {
    console.warn('marketing compose AI fallback:', err instanceof Error ? err.message : err)
    parsed = fallbackArtifact(input)
  }
  const artifact: GeneratedCampaignArtifact = {
    name: parsed.name?.trim() || 'AI Campaign Draft',
    subject: parsed.subject?.trim() || 'ANC Sports Media & Partnerships Update',
    previewText: parsed.previewText?.trim() || 'Latest ANC media, venue, and partnership updates.',
    sections: Array.isArray(parsed.sections) ? parsed.sections.map((section, index) => normalizeSection(section, index)) : [],
    social: {
      linkedin: parsed.social?.linkedin?.trim() || '',
      x: parsed.social?.x?.trim() || '',
      slack: parsed.social?.slack?.trim() || '',
    },
  }

  const visual = artifactToVisualDocument(artifact)
  const bodyHtml = exportNewsletterBodyHtml(visual)

  return { artifact, visual, bodyHtml }
}
