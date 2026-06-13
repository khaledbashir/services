import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
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

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: ANC_BRAND_VOICE,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.65,
  })

  const parsed = extractJson(text)
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
